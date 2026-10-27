import { context, Meter, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { createAiSdkTelemetry, mapProviderName, registerAiSdkTelemetry } from './ai-sdk-telemetry';

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
const tracer = provider.getTracer('test');
const contextManager = new AsyncLocalStorageContextManager();

const histograms: Record<string, jest.Mock> = {};
const meter = {
  createHistogram: (name: string) => {
    histograms[name] = jest.fn();
    return { record: histograms[name] };
  },
} as unknown as Meter;

const spanNamed = (name: string): ReadableSpan => exporter.getFinishedSpans().find((span) => span.name === name);
const parentOf = (span: ReadableSpan) => span.parentSpanContext?.spanId;

const start = { callId: 'call-1', operationId: 'ai.generateText', provider: 'google.generative-ai', modelId: 'gemini' };

describe('ai-sdk-telemetry', () => {
  beforeAll(() => context.setGlobalContextManager(contextManager.enable()));

  afterAll(() => context.disable());

  beforeEach(() => exporter.reset());

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

  it('builds an invoke_agent span with one chat and one execute_tool child, under the active span', () => {
    const telemetry = createAiSdkTelemetry(tracer, meter);
    const parent = tracer.startSpan('consumer');
    context.with(trace.setSpan(context.active(), parent), () => telemetry.onStart({ ...start, temperature: 0.2 }));
    telemetry.onLanguageModelCallStart({ callId: 'call-1', provider: 'google.generative-ai', modelId: 'gemini' });
    telemetry.onLanguageModelCallEnd({
      callId: 'call-1',
      modelId: 'gemini-001',
      finishReason: 'tool-calls',
      usage: { inputTokens: 120, outputTokens: 30 },
    });
    telemetry.onToolExecutionStart({
      callId: 'call-1',
      toolCall: { toolCallId: 'tool-1', toolName: 'getPaymentLink' },
    });
    telemetry.onToolExecutionEnd({
      callId: 'call-1',
      toolCall: { toolCallId: 'tool-1' },
      toolOutput: { type: 'tool-result' },
    });
    telemetry.onEnd({ callId: 'call-1', finishReason: 'stop', usage: { inputTokens: 200, outputTokens: 50 } });
    parent.end();

    const root = spanNamed('invoke_agent gemini');
    const chat = spanNamed('chat gemini');
    const tool = spanNamed('execute_tool getPaymentLink');
    expect(parentOf(root)).toBe(parent.spanContext().spanId);
    expect(parentOf(chat)).toBe(root.spanContext().spanId);
    expect(parentOf(tool)).toBe(root.spanContext().spanId);
    expect(chat.kind).toBe(SpanKind.CLIENT);
    expect(root.attributes).toMatchObject({
      'gen_ai.operation.name': 'invoke_agent',
      'gen_ai.provider.name': 'gcp.gemini',
      'gen_ai.request.model': 'gemini',
      'gen_ai.request.temperature': 0.2,
      'gen_ai.usage.input_tokens': 200,
      'gen_ai.usage.output_tokens': 50,
    });
    expect(chat.attributes).toMatchObject({
      'gen_ai.response.model': 'gemini-001',
      'gen_ai.response.finish_reasons': ['tool-calls'],
      'gen_ai.usage.input_tokens': 120,
    });
    expect(tool.attributes).toMatchObject({ 'gen_ai.tool.name': 'getPaymentLink', 'gen_ai.tool.type': 'function' });
    expect(tool.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('records token usage by type and the model call duration', () => {
    const telemetry = createAiSdkTelemetry(tracer, meter);
    telemetry.onStart(start);
    telemetry.onLanguageModelCallStart({ callId: 'call-1' });
    telemetry.onLanguageModelCallEnd({
      callId: 'call-1',
      modelId: 'gemini-001',
      usage: { inputTokens: 120, outputTokens: 30 },
    });

    const attributes = {
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'gcp.gemini',
      'gen_ai.request.model': 'gemini',
      'gen_ai.response.model': 'gemini-001',
    };
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

  it('runs the model request inside the chat span and the tool inside the tool span', async () => {
    const telemetry = createAiSdkTelemetry(tracer, meter);
    telemetry.onStart(start);
    telemetry.onLanguageModelCallStart({ callId: 'call-1' });
    const activeDuringModelCall = await telemetry.executeLanguageModelCall({
      callId: 'call-1',
      execute: async () => trace.getActiveSpan()?.spanContext().spanId,
    });
    telemetry.onLanguageModelCallEnd({ callId: 'call-1' });
    telemetry.onToolExecutionStart({ callId: 'call-1', toolCall: { toolCallId: 'tool-1', toolName: 'lookup' } });
    const activeDuringTool = await telemetry.executeTool({
      callId: 'call-1',
      toolCallId: 'tool-1',
      execute: async () => trace.getActiveSpan()?.spanContext().spanId,
    });
    telemetry.onToolExecutionEnd({
      callId: 'call-1',
      toolCall: { toolCallId: 'tool-1' },
      toolOutput: { type: 'tool-result' },
    });
    telemetry.onEnd({ callId: 'call-1' });

    expect(activeDuringModelCall).toBe(spanNamed('chat gemini').spanContext().spanId);
    expect(activeDuringTool).toBe(spanNamed('execute_tool lookup').spanContext().spanId);
  });

  it('runs execute untouched for an unknown call', async () => {
    const telemetry = createAiSdkTelemetry(tracer, meter);
    await expect(telemetry.executeLanguageModelCall({ callId: 'missing', execute: async () => 'ok' })).resolves.toBe(
      'ok',
    );
    await expect(
      telemetry.executeTool({ callId: 'missing', toolCallId: 't', execute: async () => 'ok' }),
    ).resolves.toBe('ok');
    expect(() => telemetry.onEnd({ callId: 'missing' })).not.toThrow();
  });

  it('marks a failed tool execution as an error', () => {
    const telemetry = createAiSdkTelemetry(tracer, meter);
    telemetry.onStart(start);
    telemetry.onToolExecutionStart({ callId: 'call-1', toolCall: { toolCallId: 'tool-1', toolName: 'lookup' } });
    telemetry.onToolExecutionEnd({
      callId: 'call-1',
      toolCall: { toolCallId: 'tool-1' },
      toolOutput: { type: 'tool-error', error: new Error('not found') },
    });
    telemetry.onEnd({ callId: 'call-1' });

    const tool = spanNamed('execute_tool lookup');
    expect(tool.status).toEqual({ code: SpanStatusCode.ERROR, message: 'not found' });
    expect(spanNamed('invoke_agent gemini').status.code).toBe(SpanStatusCode.UNSET);
  });

  it('closes every open span with the error and records its type on the duration', () => {
    const telemetry = createAiSdkTelemetry(tracer, meter);
    telemetry.onStart(start);
    telemetry.onLanguageModelCallStart({ callId: 'call-1' });
    telemetry.onError({ callId: 'call-1', error: new TypeError('fetch failed') });

    expect(spanNamed('chat gemini').status.code).toBe(SpanStatusCode.ERROR);
    expect(spanNamed('invoke_agent gemini').status).toEqual({ code: SpanStatusCode.ERROR, message: 'fetch failed' });
    expect(histograms['gen_ai.client.operation.duration']).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ 'error.type': 'TypeError' }),
    );
  });

  it('ends the spans of an aborted call without marking an error', () => {
    const telemetry = createAiSdkTelemetry(tracer, meter);
    telemetry.onStart(start);
    telemetry.onLanguageModelCallStart({ callId: 'call-1' });
    telemetry.onAbort({ callId: 'call-1' });

    expect(exporter.getFinishedSpans()).toHaveLength(2);
    expect(spanNamed('invoke_agent gemini').attributes['gen_ai.response.aborted']).toBe(true);
    expect(spanNamed('invoke_agent gemini').status.code).toBe(SpanStatusCode.UNSET);
  });

  it('never records prompts, replies, tool arguments or tool results', () => {
    const telemetry = createAiSdkTelemetry(tracer, meter);
    telemetry.onStart({ ...start, messages: [{ role: 'user', content: 'ABC1D23' }] } as typeof start);
    telemetry.onToolExecutionStart({
      callId: 'call-1',
      toolCall: { toolCallId: 'tool-1', toolName: 'lookup', input: { plate: 'ABC1D23' } },
    } as Parameters<typeof telemetry.onToolExecutionStart>[0]);
    telemetry.onToolExecutionEnd({
      callId: 'call-1',
      toolCall: { toolCallId: 'tool-1' },
      toolOutput: { type: 'tool-result' },
    });
    telemetry.onEnd({ callId: 'call-1', text: 'reply' } as Parameters<typeof telemetry.onEnd>[0]);

    const recorded = JSON.stringify(exporter.getFinishedSpans().map((span) => span.attributes));
    expect(recorded).not.toContain('ABC1D23');
    expect(recorded).not.toContain('reply');
  });

  it('appends the integration to the global list the AI SDK reads', () => {
    const existing = { onStart: jest.fn() };
    (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS = [existing];
    registerAiSdkTelemetry(tracer, meter);
    const integrations = (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS;
    expect(integrations).toHaveLength(2);
    expect(integrations[0]).toBe(existing);
  });
});
