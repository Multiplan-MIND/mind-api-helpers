/**
 * Versão das convenções semânticas GenAI que os spans e as métricas seguem. Essas convenções ainda estão em
 * desenvolvimento e renomeiam atributos entre versões, por isso o tracer e o meter a declaram como schema URL.
 */
export const GEN_AI_SCHEMA_URL = 'https://opentelemetry.io/schemas/1.44.0';

/**
 * Formatos mínimos dos eventos de telemetria do AI SDK (`ai` >= 7), compartilhados pelas integrações de tracing e de
 * métricas. Só os campos lidos aqui são declarados, para a biblioteca não depender do `ai` e continuar funcionando
 * entre as versões minor dele.
 */
export interface OperationStartEvent {
  callId: string;
  operationId: string;
  provider?: string;
  modelId?: string;
  functionId?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** O conjunto de ferramentas; só se lê se ele tem alguma. */
  tools?: object;
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

/** Geração de texto com ferramentas é um loop de agente; sem ferramentas é um chat, novas tentativas incluídas. */
const TEXT_GENERATION_OPERATIONS = ['ai.generateText', 'ai.streamText'];

const OPERATION_NAMES: Record<string, string> = {
  'ai.generateObject': 'chat',
  'ai.streamObject': 'chat',
  'ai.embed': 'embeddings',
  'ai.embedMany': 'embeddings',
  'ai.rerank': 'rerank',
};

/** Converte o id de provedor do AI SDK (`google.generative-ai`) no `gen_ai.provider.name` das convenções semânticas. */
export function mapProviderName(provider?: string): string {
  if (!provider) return 'unknown';
  const lower = provider.toLowerCase();
  const match = PROVIDER_NAMES.find(
    ([prefix]) => lower === prefix || lower.startsWith(`${prefix}.`) || lower.startsWith(`${prefix}-`),
  );
  return match ? match[1] : provider;
}

/**
 * Converte uma operação do AI SDK (`ai.generateText` e as ferramentas dela) no `gen_ai.operation.name` das convenções
 * semânticas: `invoke_agent` para geração de texto com ferramentas, `chat` sem elas.
 */
export function mapOperationName(event: Pick<OperationStartEvent, 'operationId' | 'tools'>): string {
  if (TEXT_GENERATION_OPERATIONS.includes(event.operationId)) {
    return event.tools && Object.keys(event.tools).length > 0 ? 'invoke_agent' : 'chat';
  }
  return OPERATION_NAMES[event.operationId] ?? event.operationId;
}

/**
 * Acrescenta uma integração a `globalThis.AI_SDK_TELEMETRY_INTEGRATIONS`, que o AI SDK (`ai` >= 7) lê em toda chamada
 * sem `telemetry.integrations` própria. Um serviço sem o AI SDK fica só com uma lista sem uso.
 */
export function registerAiSdkIntegration(integration: object): void {
  const globalScope = globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] };
  globalScope.AI_SDK_TELEMETRY_INTEGRATIONS ??= [];
  globalScope.AI_SDK_TELEMETRY_INTEGRATIONS.push(integration);
}
