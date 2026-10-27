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

  it('maps AI SDK operation ids to GenAI operation names', () => {
    expect(mapOperationName('ai.generateText')).toBe('invoke_agent');
    expect(mapOperationName('ai.embedMany')).toBe('embeddings');
    expect(mapOperationName('ai.custom')).toBe('ai.custom');
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
