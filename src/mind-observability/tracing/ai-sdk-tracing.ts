import { Context, context, Span, SpanKind, SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
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

/** The AI SDK telemetry integration interface, reduced to the callbacks implemented here. */
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
 * Builds an AI SDK telemetry integration that turns every `generateText`/`streamText`/`embed` call into spans that
 * follow the GenAI semantic conventions: one `invoke_agent <model>` span per call, one `chat <model>` span per model
 * round trip and one `execute_tool <name>` span per tool execution. Model requests and tool executions run inside their
 * spans, so the HTTP, database and queue spans they produce nest under them.
 *
 * Prompts, replies, tool arguments and tool results are never recorded: they carry customer data, and a shared library
 * cannot know each service's rules for it.
 */
export function createAiSdkTracing(tracer: Tracer): AiSdkTracingIntegration {
  const calls = new Map<string, CallState>();

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

  return {
    onStart(event) {
      const operationName = mapOperationName(event.operationId);
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
      calls.set(event.callId, {
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
      const state = calls.get(event.callId);
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
      calls.delete(event.callId);
    },

    onAbort(event) {
      const state = calls.get(event.callId);
      if (!state) return;
      endModelCall(state);
      endTools(state);
      state.root.setAttribute('gen_ai.response.aborted', true);
      state.root.end();
      calls.delete(event.callId);
    },

    onError(error) {
      const event = error as ErrorEvent;
      const state = event?.callId ? calls.get(event.callId) : undefined;
      if (!state) return;
      const cause = event.error ?? error;
      endModelCall(state, cause);
      endTools(state, cause);
      recordError(state.root, cause);
      state.root.end();
      calls.delete(event.callId);
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
