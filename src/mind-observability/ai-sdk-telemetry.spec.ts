import { mapOperationName, mapProviderName, registerAiSdkIntegration } from './ai-sdk-telemetry';

describe('ai-sdk-telemetry', () => {
  afterEach(() => {
    delete (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS;
  });

  it('maps AI SDK provider ids to GenAI provider names', () => {
    expect(mapProviderName('google.generative-ai')).toBe('gcp.gemini');
    expect(mapProviderName('google.vertex.chat')).toBe('gcp.vertex_ai');
    expect(mapProviderName('openai.chat')).toBe('openai');
    expect(mapProviderName('acme.chat')).toBe('acme.chat');
    expect(mapProviderName(undefined)).toBe('unknown');
  });

  it('maps text generation with tools to invoke_agent and without tools to chat', () => {
    expect(mapOperationName({ operationId: 'ai.generateText', tools: { lookup: {} } })).toBe('invoke_agent');
    expect(mapOperationName({ operationId: 'ai.streamText', tools: { lookup: {} } })).toBe('invoke_agent');
    expect(mapOperationName({ operationId: 'ai.generateText' })).toBe('chat');
    expect(mapOperationName({ operationId: 'ai.streamText', tools: {} })).toBe('chat');
  });

  it('maps the other AI SDK operation ids to GenAI operation names', () => {
    expect(mapOperationName({ operationId: 'ai.generateObject' })).toBe('chat');
    expect(mapOperationName({ operationId: 'ai.embedMany' })).toBe('embeddings');
    expect(mapOperationName({ operationId: 'ai.custom' })).toBe('ai.custom');
  });

  it('appends integrations to the global list the AI SDK reads', () => {
    const existing = { onStart: jest.fn() };
    const added = { onEnd: jest.fn() };
    (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS = [existing];
    registerAiSdkIntegration(added);
    const integrations = (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS;
    expect(integrations).toEqual([existing, added]);
  });

  it('creates the global list when it does not exist', () => {
    registerAiSdkIntegration({});
    expect((globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS).toHaveLength(1);
  });
});
