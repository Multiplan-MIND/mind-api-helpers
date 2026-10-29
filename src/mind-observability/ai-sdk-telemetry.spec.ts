/**
 * Testes executados:
 * - converte os ids de provedor do AI SDK nos nomes de provedor GenAI
 * - converte geração de texto com ferramentas em invoke_agent e sem ferramentas em chat
 * - converte as demais operações do AI SDK nos nomes de operação GenAI
 * - acrescenta integrações à lista global que o AI SDK lê
 * - cria a lista global quando ela não existe
 */

import { mapOperationName, mapProviderName, registerAiSdkIntegration } from './ai-sdk-telemetry';

/** Testes */
describe('ai-sdk-telemetry', () => {
  afterEach(() => {
    delete (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS;
  });

  it('converte os ids de provedor do AI SDK nos nomes de provedor GenAI', () => {
    expect(mapProviderName('google.generative-ai')).toBe('gcp.gemini');
    expect(mapProviderName('google.vertex.chat')).toBe('gcp.vertex_ai');
    expect(mapProviderName('openai.chat')).toBe('openai');
    expect(mapProviderName('acme.chat')).toBe('acme.chat');
    expect(mapProviderName(undefined)).toBe('unknown');
  });

  it('converte geração de texto com ferramentas em invoke_agent e sem ferramentas em chat', () => {
    expect(mapOperationName({ operationId: 'ai.generateText', tools: { lookup: {} } })).toBe('invoke_agent');
    expect(mapOperationName({ operationId: 'ai.streamText', tools: { lookup: {} } })).toBe('invoke_agent');
    expect(mapOperationName({ operationId: 'ai.generateText' })).toBe('chat');
    expect(mapOperationName({ operationId: 'ai.streamText', tools: {} })).toBe('chat');
  });

  it('converte as demais operações do AI SDK nos nomes de operação GenAI', () => {
    expect(mapOperationName({ operationId: 'ai.generateObject' })).toBe('chat');
    expect(mapOperationName({ operationId: 'ai.embedMany' })).toBe('embeddings');
    expect(mapOperationName({ operationId: 'ai.custom' })).toBe('ai.custom');
  });

  it('acrescenta integrações à lista global que o AI SDK lê', () => {
    const existing = { onStart: jest.fn() };
    const added = { onEnd: jest.fn() };
    (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS = [existing];
    registerAiSdkIntegration(added);
    const integrations = (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS;
    expect(integrations).toEqual([existing, added]);
  });

  it('cria a lista global quando ela não existe', () => {
    registerAiSdkIntegration({});
    expect((globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS).toHaveLength(1);
  });
});
