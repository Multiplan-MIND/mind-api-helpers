import { Context, context, Histogram, Meter, Span, SpanKind, SpanStatusCode, trace, Tracer } from '@opentelemetry/api';

/**
 * Minimal shapes of the AI SDK (`ai` >= 7) telemetry events. Only the fields read here are declared, so the library
 * does not depend on `ai` and keeps working across its minor versions.
 */
interface OperationStartEvent {
  callId: string;
  operationId: string;
  provider?: string;
  modelId?: string;
  functionId?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

interface OperationEndEvent {
  callId: string;
  finishReason?: string;
  usage?: Usage;
}

interface LanguageModelCallStartEvent {
  callId: string;
  provider?: string;
  modelId?: string;
}

interface LanguageModelCallEndEvent {
  callId: string;
  modelId?: string;
  responseId?: string;
  finishReason?: string;
  usage?: Usage;
}

interface ToolExecutionStartEvent {
  callId: string;
  toolCall: { toolCallId: string; toolName: string; providerExecuted?: boolean };
}

interface ToolExecutionEndEvent {
  callId: string;
  toolCall: { toolCallId: string };
  toolOutput: { type: string; error?: unknown };
}

interface ErrorEvent {
  callId?: string;
  error?: unknown;
}

interface ModelCallState {
  span: Span;
  context: Context;
  startedAt: number;
  attributes: Record<string, string>;
}

interface CallState {
  root: Span;
  rootContext: Context;
  operationName: string;
  providerName: string;
  requestModel: string;
  modelCall?: ModelCallState;
  tools: Map<string, { span: Span; context: Context }>;
}

/** The AI SDK telemetry integration interface, reduced to the callbacks implemented here. */
export interface AiSdkTelemetryIntegration {
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

const PROVIDER_NAMES: [string, string][] = [
  ['google.vertex', 'gcp.vertex_ai'],
  ['google-vertex', 'gcp.vertex_ai'],
  ['google', 'gcp.gemini'],
  ['openai', 'openai'],
  ['azure', 'azure.ai.openai'],
  ['anthropic', 'anthropic'],
  ['amazon-bedrock', 'aws.bedrock'],
  ['bedrock', 'aws.bedrock'],
  ['mistral', 'mistral_ai'],
  ['deepseek', 'deepseek'],
  ['xai', 'x_ai'],
];

const OPERATION_NAMES: Record<string, string> = {
  'ai.generateText': 'invoke_agent',
  'ai.streamText': 'invoke_agent',
  'ai.generateObject': 'invoke_agent',
  'ai.streamObject': 'invoke_agent',
  'ai.embed': 'embeddings',
  'ai.embedMany': 'embeddings',
  'ai.rerank': 'rerank',
};

/** Maps an AI SDK provider id (`google.generative-ai`) to the `gen_ai.provider.name` of the semantic conventions. */
export function mapProviderName(provider?: string): string {
  if (!provider) return 'unknown';
  const lower = provider.toLowerCase();
  const match = PROVIDER_NAMES.find(
    ([prefix]) => lower === prefix || lower.startsWith(`${prefix}.`) || lower.startsWith(`${prefix}-`),
  );
  return match ? match[1] : provider;
}

function recordError(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.name : '_OTHER';
}

/**
 * Builds an AI SDK telemetry integration that turns every `generateText`/`streamText`/`embed` call into OpenTelemetry
 * spans and GenAI metrics, following the GenAI semantic conventions: one `invoke_agent <model>` span per call, one
 * `chat <model>` span per model round trip and one `execute_tool <name>` span per tool execution. Model requests and
 * tool executions run inside their spans, so the HTTP, database and queue spans they produce nest under them.
 *
 * Prompts, replies, tool arguments and tool results are never recorded: they carry customer data, and a shared library
 * cannot know each service's rules for it.
 */
export function createAiSdkTelemetry(tracer: Tracer, meter: Meter): AiSdkTelemetryIntegration {
  const calls = new Map<string, CallState>();
  const tokenUsage: Histogram = meter.createHistogram('gen_ai.client.token.usage', {
    description: 'Number of input and output tokens used',
    unit: '{token}',
  });
  const operationDuration: Histogram = meter.createHistogram('gen_ai.client.operation.duration', {
    description: 'GenAI operation duration',
    unit: 's',
  });

  const endModelCall = (state: CallState, error?: unknown): void => {
    const modelCall = state.modelCall;
    if (!modelCall) return;
    const attributes =
      error === undefined ? modelCall.attributes : { ...modelCall.attributes, 'error.type': errorType(error) };
    if (error !== undefined) recordError(modelCall.span, error);
    operationDuration.record((Date.now() - modelCall.startedAt) / 1000, attributes);
    modelCall.span.end();
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
      const operationName = OPERATION_NAMES[event.operationId] ?? event.operationId;
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
        operationName,
        providerName,
        requestModel,
        tools: new Map(),
      });
    },

    onLanguageModelCallStart(event) {
      const state = calls.get(event.callId);
      if (!state) return;
      const providerName = event.provider ? mapProviderName(event.provider) : state.providerName;
      const requestModel = event.modelId ?? state.requestModel;
      const span = tracer.startSpan(
        `chat ${requestModel}`,
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'gen_ai.operation.name': 'chat',
            'gen_ai.provider.name': providerName,
            'gen_ai.request.model': requestModel,
          },
        },
        state.rootContext,
      );
      state.modelCall = {
        span,
        context: trace.setSpan(state.rootContext, span),
        startedAt: Date.now(),
        attributes: {
          'gen_ai.operation.name': 'chat',
          'gen_ai.provider.name': providerName,
          'gen_ai.request.model': requestModel,
        },
      };
    },

    onLanguageModelCallEnd(event) {
      const state = calls.get(event.callId);
      const modelCall = state?.modelCall;
      if (!modelCall) return;
      if (event.modelId) modelCall.attributes['gen_ai.response.model'] = event.modelId;
      modelCall.span.setAttributes({
        ...(event.modelId ? { 'gen_ai.response.model': event.modelId } : {}),
        ...(event.responseId ? { 'gen_ai.response.id': event.responseId } : {}),
        ...(event.finishReason ? { 'gen_ai.response.finish_reasons': [event.finishReason] } : {}),
        ...(event.usage?.inputTokens != null ? { 'gen_ai.usage.input_tokens': event.usage.inputTokens } : {}),
        ...(event.usage?.outputTokens != null ? { 'gen_ai.usage.output_tokens': event.usage.outputTokens } : {}),
      });
      if (event.usage?.inputTokens != null) {
        tokenUsage.record(event.usage.inputTokens, { ...modelCall.attributes, 'gen_ai.token.type': 'input' });
      }
      if (event.usage?.outputTokens != null) {
        tokenUsage.record(event.usage.outputTokens, { ...modelCall.attributes, 'gen_ai.token.type': 'output' });
      }
      if (event.finishReason === 'error') modelCall.span.setStatus({ code: SpanStatusCode.ERROR });
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

/**
 * Registers the integration in `globalThis.AI_SDK_TELEMETRY_INTEGRATIONS`, which the AI SDK (`ai` >= 7) reads on every
 * call that does not pass its own `telemetry.integrations`. A service without the AI SDK only gets an unused array.
 */
export function registerAiSdkTelemetry(tracer: Tracer, meter: Meter): void {
  const globalScope = globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] };
  globalScope.AI_SDK_TELEMETRY_INTEGRATIONS ??= [];
  globalScope.AI_SDK_TELEMETRY_INTEGRATIONS.push(createAiSdkTelemetry(tracer, meter));
}
