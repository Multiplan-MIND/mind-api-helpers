/**
 * Minimal shapes of the AI SDK (`ai` >= 7) telemetry events, shared by the tracing and the metrics integrations. Only
 * the fields read here are declared, so the library does not depend on `ai` and keeps working across its minor versions.
 */
export interface OperationStartEvent {
  callId: string;
  operationId: string;
  provider?: string;
  modelId?: string;
  functionId?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface OperationEndEvent {
  callId: string;
  finishReason?: string;
  usage?: Usage;
}

export interface LanguageModelCallStartEvent {
  callId: string;
  provider?: string;
  modelId?: string;
}

export interface LanguageModelCallEndEvent {
  callId: string;
  modelId?: string;
  responseId?: string;
  finishReason?: string;
  usage?: Usage;
}

export interface ToolExecutionStartEvent {
  callId: string;
  toolCall: { toolCallId: string; toolName: string; providerExecuted?: boolean };
}

export interface ToolExecutionEndEvent {
  callId: string;
  toolCall: { toolCallId: string };
  toolOutput: { type: string; error?: unknown };
}

export interface ErrorEvent {
  callId?: string;
  error?: unknown;
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

/** Maps an AI SDK operation id (`ai.generateText`) to the `gen_ai.operation.name` of the semantic conventions. */
export function mapOperationName(operationId: string): string {
  return OPERATION_NAMES[operationId] ?? operationId;
}

/**
 * Appends an integration to `globalThis.AI_SDK_TELEMETRY_INTEGRATIONS`, which the AI SDK (`ai` >= 7) reads on every
 * call that does not pass its own `telemetry.integrations`. A service without the AI SDK only gets an unused array.
 */
export function registerAiSdkIntegration(integration: object): void {
  const globalScope = globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] };
  globalScope.AI_SDK_TELEMETRY_INTEGRATIONS ??= [];
  globalScope.AI_SDK_TELEMETRY_INTEGRATIONS.push(integration);
}
