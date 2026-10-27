import { Meter } from '@opentelemetry/api';
import { createAiSdkMetrics } from './ai-sdk-metrics';

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

describe('createAiSdkMetrics', () => {
  it('records token usage by type and the model call duration', () => {
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

  it('records the duration of a failed model call with the error type', () => {
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

  it('records nothing for an unknown call', () => {
    const aiSdkMetrics = createAiSdkMetrics(meter);
    aiSdkMetrics.onLanguageModelCallStart({ callId: 'missing' });
    aiSdkMetrics.onLanguageModelCallEnd({ callId: 'missing', usage: { inputTokens: 1 } });
    expect(() => aiSdkMetrics.onEnd({ callId: 'missing' })).not.toThrow();

    expect(histograms['gen_ai.client.token.usage']).not.toHaveBeenCalled();
    expect(histograms['gen_ai.client.operation.duration']).not.toHaveBeenCalled();
  });
});
