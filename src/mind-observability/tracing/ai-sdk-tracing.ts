import { Context, context, Span, SpanKind, SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import { AiSdkCalls, AiSdkCallsOptions, CALL_TIMEOUT_ERROR_TYPE } from '../ai-sdk-calls';
import {
  ErrorEvent,
  LanguageModelCallEndEvent,
  LanguageModelCallStartEvent,
  mapOperationName,
  mapProviderName,
  OperationEndEvent,
  OperationStartEvent,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from '../ai-sdk-telemetry';

interface CallState {
  root: Span;
  rootContext: Context;
  providerName: string;
  requestModel: string;
  modelCall?: { span: Span; context: Context };
  tools: Map<string, { span: Span; context: Context }>;
}

/** A interface de integração de telemetria do AI SDK, reduzida aos callbacks implementados aqui. */
export interface AiSdkTracingIntegration {
  onStart(event: OperationStartEvent): void;
  onLanguageModelCallStart(event: LanguageModelCallStartEvent): void;
  onLanguageModelCallEnd(event: LanguageModelCallEndEvent): void;
  onToolExecutionStart(event: ToolExecutionStartEvent): void;
  onToolExecutionEnd(event: ToolExecutionEndEvent): void;
  onEnd(event: OperationEndEvent): void;
  onAbort(event: { callId: string }): void;
  onError(error: unknown): void;
  executeLanguageModelCall<T>(options: { callId: string; execute: () => PromiseLike<T> }): PromiseLike<T>;
  executeTool<T>(options: { callId: string; toolCallId: string; execute: () => PromiseLike<T> }): PromiseLike<T>;
}

function recordError(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}

/**
 * Monta uma integração de telemetria do AI SDK que transforma cada chamada de `generateText`, `streamText` e `embed` em
 * spans das convenções semânticas GenAI: um span raiz por chamada (`invoke_agent <modelo>` com ferramentas,
 * `chat <modelo>` sem), um span `chat <modelo>` por ida ao modelo e um span `execute_tool <nome>` por execução de
 * ferramenta. As requisições ao modelo e as ferramentas rodam dentro dos seus spans, então os spans de HTTP, banco e
 * fila que elas geram ficam aninhados. Uma chamada que o AI SDK nunca encerra é fechada como erro com
 * `error.type=timeout` (ver `AiSdkCalls`).
 *
 * Prompt, resposta, argumentos e resultado de ferramenta nunca são gravados: carregam dado de cliente, e uma biblioteca
 * compartilhada não conhece as regras de cada serviço para ele.
 */
export function createAiSdkTracing(tracer: Tracer, options?: AiSdkCallsOptions): AiSdkTracingIntegration {
  const endModelCall = (state: CallState, error?: unknown): void => {
    if (!state.modelCall) return;
    if (error !== undefined) recordError(state.modelCall.span, error);
    state.modelCall.span.end();
    state.modelCall = undefined;
  };

  const endTools = (state: CallState, error?: unknown): void => {
    for (const { span } of state.tools.values()) {
      if (error !== undefined) recordError(span, error);
      span.end();
    }
    state.tools.clear();
  };

  const expire = (state: CallState): void => {
    const timeout = new Error('AI SDK call did not end within the maximum age');
    endModelCall(state, timeout);
    endTools(state, timeout);
    recordError(state.root, timeout);
    state.root.setAttribute('error.type', CALL_TIMEOUT_ERROR_TYPE);
    state.root.end();
  };

  const calls = new AiSdkCalls<CallState>(expire, options);

  return {
    onStart(event) {
      const operationName = mapOperationName(event);
      const providerName = mapProviderName(event.provider);
      const requestModel = event.modelId ?? 'unknown';
      const root = tracer.startSpan(`${operationName} ${requestModel}`, {
        kind: SpanKind.INTERNAL,
        attributes: {
          'gen_ai.operation.name': operationName,
          'gen_ai.provider.name': providerName,
          'gen_ai.request.model': requestModel,
          ...(event.functionId ? { 'gen_ai.agent.name': event.functionId } : {}),
          ...(event.temperature != null ? { 'gen_ai.request.temperature': event.temperature } : {}),
          ...(event.maxOutputTokens != null ? { 'gen_ai.request.max_tokens': event.maxOutputTokens } : {}),
        },
      });
      calls.start(event.callId, {
        root,
        rootContext: trace.setSpan(context.active(), root),
        providerName,
        requestModel,
        tools: new Map(),
      });
    },

    onLanguageModelCallStart(event) {
      const state = calls.get(event.callId);
      if (!state) return;
      const requestModel = event.modelId ?? state.requestModel;
      const span = tracer.startSpan(
        `chat ${requestModel}`,
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'gen_ai.operation.name': 'chat',
            'gen_ai.provider.name': event.provider ? mapProviderName(event.provider) : state.providerName,
            'gen_ai.request.model': requestModel,
          },
        },
        state.rootContext,
      );
      state.modelCall = { span, context: trace.setSpan(state.rootContext, span) };
    },

    onLanguageModelCallEnd(event) {
      const state = calls.get(event.callId);
      if (!state?.modelCall) return;
      state.modelCall.span.setAttributes({
        ...(event.modelId ? { 'gen_ai.response.model': event.modelId } : {}),
        ...(event.responseId ? { 'gen_ai.response.id': event.responseId } : {}),
        ...(event.finishReason ? { 'gen_ai.response.finish_reasons': [event.finishReason] } : {}),
        ...(event.usage?.inputTokens != null ? { 'gen_ai.usage.input_tokens': event.usage.inputTokens } : {}),
        ...(event.usage?.outputTokens != null ? { 'gen_ai.usage.output_tokens': event.usage.outputTokens } : {}),
      });
      if (event.finishReason === 'error') state.modelCall.span.setStatus({ code: SpanStatusCode.ERROR });
      endModelCall(state);
    },

    onToolExecutionStart(event) {
      const state = calls.get(event.callId);
      if (!state) return;
      const { toolCallId, toolName, providerExecuted } = event.toolCall;
      const span = tracer.startSpan(
        `execute_tool ${toolName}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            'gen_ai.operation.name': 'execute_tool',
            'gen_ai.tool.name': toolName,
            'gen_ai.tool.call.id': toolCallId,
            'gen_ai.tool.type': providerExecuted ? 'extension' : 'function',
          },
        },
        state.rootContext,
      );
      state.tools.set(toolCallId, { span, context: trace.setSpan(state.rootContext, span) });
    },

    onToolExecutionEnd(event) {
      const state = calls.get(event.callId);
      const tool = state?.tools.get(event.toolCall.toolCallId);
      if (!tool) return;
      if (event.toolOutput.type !== 'tool-result') recordError(tool.span, event.toolOutput.error);
      tool.span.end();
      state.tools.delete(event.toolCall.toolCallId);
    },

    onEnd(event) {
      const state = calls.finish(event.callId);
      if (!state) return;
      endModelCall(state);
      endTools(state);
      state.root.setAttributes({
        ...(event.finishReason ? { 'gen_ai.response.finish_reasons': [event.finishReason] } : {}),
        ...(event.usage?.inputTokens != null ? { 'gen_ai.usage.input_tokens': event.usage.inputTokens } : {}),
        ...(event.usage?.outputTokens != null ? { 'gen_ai.usage.output_tokens': event.usage.outputTokens } : {}),
      });
      if (event.finishReason === 'error') state.root.setStatus({ code: SpanStatusCode.ERROR });
      state.root.end();
    },

    onAbort(event) {
      const state = calls.finish(event.callId);
      if (!state) return;
      endModelCall(state);
      endTools(state);
      state.root.setAttribute('gen_ai.response.aborted', true);
      state.root.end();
    },

    onError(error) {
      const event = error as ErrorEvent;
      const state = event?.callId ? calls.finish(event.callId) : undefined;
      if (!state) return;
      const cause = event.error ?? error;
      endModelCall(state, cause);
      endTools(state, cause);
      recordError(state.root, cause);
      state.root.end();
    },

    executeLanguageModelCall({ callId, execute }) {
      const state = calls.get(callId);
      const parent = state?.modelCall?.context ?? state?.rootContext;
      return parent ? context.with(parent, execute) : execute();
    },

    executeTool({ callId, toolCallId, execute }) {
      const parent = calls.get(callId)?.tools.get(toolCallId)?.context;
      return parent ? context.with(parent, execute) : execute();
    },
  };
}
