/**
 * Testes executados:
 * - registra o uso de tokens por tipo e a duração da ida ao modelo
 * - registra a duração de uma ida ao modelo que falhou, com o tipo do erro
 * - registra como timeout a duração de uma ida ao modelo que nunca terminou
 * - mede a duração com o relógio monotônico
 * - não registra nada para uma chamada desconhecida
 */

import { Meter } from '@opentelemetry/api';
import { createAiSdkMetrics } from './ai-sdk-metrics';

/** Fixtures: meter falso que guarda um mock por histograma, e a chamada padrão do AI SDK. */
const histograms: Record<string, jest.Mock> = {};
const meter = {
  createHistogram: (name: string) => {
    histograms[name] = jest.fn();
    return { record: histograms[name] };
  },
} as unknown as Meter;

const start = { callId: 'call-1', operationId: 'ai.generateText', provider: 'google.generative-ai', modelId: 'gemini' };
const chatAttributes = {
  'gen_ai.operation.name': 'chat',
  'gen_ai.provider.name': 'gcp.gemini',
  'gen_ai.request.model': 'gemini',
};

/** Testes */
describe('createAiSdkMetrics', () => {
  it('registra o uso de tokens por tipo e a duração da ida ao modelo', () => {
    const aiSdkMetrics = createAiSdkMetrics(meter);
    aiSdkMetrics.onStart(start);
    aiSdkMetrics.onLanguageModelCallStart({ callId: 'call-1' });
    aiSdkMetrics.onLanguageModelCallEnd({
      callId: 'call-1',
      modelId: 'gemini-001',
      usage: { inputTokens: 120, outputTokens: 30 },
    });

    const attributes = { ...chatAttributes, 'gen_ai.response.model': 'gemini-001' };
    expect(histograms['gen_ai.client.token.usage']).toHaveBeenCalledWith(120, {
      ...attributes,
      'gen_ai.token.type': 'input',
    });
    expect(histograms['gen_ai.client.token.usage']).toHaveBeenCalledWith(30, {
      ...attributes,
      'gen_ai.token.type': 'output',
    });
    expect(histograms['gen_ai.client.operation.duration']).toHaveBeenCalledWith(expect.any(Number), attributes);
  });

  it('registra a duração de uma ida ao modelo que falhou, com o tipo do erro', () => {
    const aiSdkMetrics = createAiSdkMetrics(meter);
    aiSdkMetrics.onStart(start);
    aiSdkMetrics.onLanguageModelCallStart({ callId: 'call-1' });
    aiSdkMetrics.onError({ callId: 'call-1', error: new TypeError('fetch failed') });

    expect(histograms['gen_ai.client.operation.duration']).toHaveBeenCalledWith(expect.any(Number), {
      ...chatAttributes,
      'error.type': 'TypeError',
    });
    expect(histograms['gen_ai.client.token.usage']).not.toHaveBeenCalled();
  });

  it('registra como timeout a duração de uma ida ao modelo que nunca terminou', () => {
    const aiSdkMetrics = createAiSdkMetrics(meter, { maxOpenCalls: 1 });
    aiSdkMetrics.onStart(start);
    aiSdkMetrics.onLanguageModelCallStart({ callId: 'call-1' });
    aiSdkMetrics.onStart({ ...start, callId: 'call-2' });

    expect(histograms['gen_ai.client.operation.duration']).toHaveBeenCalledWith(expect.any(Number), {
      ...chatAttributes,
      'error.type': 'timeout',
    });
  });

  it('mede a duração com o relógio monotônico', () => {
    const now = jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(3500);
    const aiSdkMetrics = createAiSdkMetrics(meter);
    aiSdkMetrics.onStart(start);
    aiSdkMetrics.onLanguageModelCallStart({ callId: 'call-1' });
    aiSdkMetrics.onLanguageModelCallEnd({ callId: 'call-1' });
    now.mockRestore();

    expect(histograms['gen_ai.client.operation.duration']).toHaveBeenCalledWith(2.5, chatAttributes);
  });

  it('não registra nada para uma chamada desconhecida', () => {
    const aiSdkMetrics = createAiSdkMetrics(meter);
    aiSdkMetrics.onLanguageModelCallStart({ callId: 'missing' });
    aiSdkMetrics.onLanguageModelCallEnd({ callId: 'missing', usage: { inputTokens: 1 } });
    expect(() => aiSdkMetrics.onEnd({ callId: 'missing' })).not.toThrow();

    expect(histograms['gen_ai.client.token.usage']).not.toHaveBeenCalled();
    expect(histograms['gen_ai.client.operation.duration']).not.toHaveBeenCalled();
  });
});
