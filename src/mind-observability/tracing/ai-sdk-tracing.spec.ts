import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { createAiSdkTracing } from './ai-sdk-tracing';

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
const tracer = provider.getTracer('test');
const contextManager = new AsyncLocalStorageContextManager();

const spanNamed = (name: string): ReadableSpan => exporter.getFinishedSpans().find((span) => span.name === name);
const parentOf = (span: ReadableSpan) => span.parentSpanContext?.spanId;

const start = { callId: 'call-1', operationId: 'ai.generateText', provider: 'google.generative-ai', modelId: 'gemini' };
const toolResult = { callId: 'call-1', toolCall: { toolCallId: 'tool-1' }, toolOutput: { type: 'tool-result' } };

describe('createAiSdkTracing', () => {
  beforeAll(() => context.setGlobalContextManager(contextManager.enable()));

  afterAll(() => context.disable());

  beforeEach(() => exporter.reset());

  it('builds an invoke_agent span with one chat and one execute_tool child, under the active span', () => {
    const tracing = createAiSdkTracing(tracer);
    const parent = tracer.startSpan('consumer');
    context.with(trace.setSpan(context.active(), parent), () => tracing.onStart({ ...start, temperature: 0.2 }));
    tracing.onLanguageModelCallStart({ callId: 'call-1', provider: 'google.generative-ai', modelId: 'gemini' });
    tracing.onLanguageModelCallEnd({
      callId: 'call-1',
      modelId: 'gemini-001',
      finishReason: 'tool-calls',
      usage: { inputTokens: 120, outputTokens: 30 },
    });
    tracing.onToolExecutionStart({ callId: 'call-1', toolCall: { toolCallId: 'tool-1', toolName: 'getPaymentLink' } });
    tracing.onToolExecutionEnd(toolResult);
    tracing.onEnd({ callId: 'call-1', finishReason: 'stop', usage: { inputTokens: 200, outputTokens: 50 } });
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

  it('runs the model request inside the chat span and the tool inside the tool span', async () => {
    const tracing = createAiSdkTracing(tracer);
    tracing.onStart(start);
    tracing.onLanguageModelCallStart({ callId: 'call-1' });
    const activeDuringModelCall = await tracing.executeLanguageModelCall({
      callId: 'call-1',
      execute: async () => trace.getActiveSpan()?.spanContext().spanId,
    });
    tracing.onLanguageModelCallEnd({ callId: 'call-1' });
    tracing.onToolExecutionStart({ callId: 'call-1', toolCall: { toolCallId: 'tool-1', toolName: 'lookup' } });
    const activeDuringTool = await tracing.executeTool({
      callId: 'call-1',
      toolCallId: 'tool-1',
      execute: async () => trace.getActiveSpan()?.spanContext().spanId,
    });
    tracing.onToolExecutionEnd(toolResult);
    tracing.onEnd({ callId: 'call-1' });

    expect(activeDuringModelCall).toBe(spanNamed('chat gemini').spanContext().spanId);
    expect(activeDuringTool).toBe(spanNamed('execute_tool lookup').spanContext().spanId);
  });

  it('runs execute untouched for an unknown call', async () => {
    const tracing = createAiSdkTracing(tracer);
    await expect(tracing.executeLanguageModelCall({ callId: 'missing', execute: async () => 'ok' })).resolves.toBe(
      'ok',
    );
    await expect(tracing.executeTool({ callId: 'missing', toolCallId: 't', execute: async () => 'ok' })).resolves.toBe(
      'ok',
    );
    expect(() => tracing.onEnd({ callId: 'missing' })).not.toThrow();
  });

  it('marks a failed tool execution as an error', () => {
    const tracing = createAiSdkTracing(tracer);
    tracing.onStart(start);
    tracing.onToolExecutionStart({ callId: 'call-1', toolCall: { toolCallId: 'tool-1', toolName: 'lookup' } });
    tracing.onToolExecutionEnd({
      callId: 'call-1',
      toolCall: { toolCallId: 'tool-1' },
      toolOutput: { type: 'tool-error', error: new Error('not found') },
    });
    tracing.onEnd({ callId: 'call-1' });

    expect(spanNamed('execute_tool lookup').status).toEqual({ code: SpanStatusCode.ERROR, message: 'not found' });
    expect(spanNamed('invoke_agent gemini').status.code).toBe(SpanStatusCode.UNSET);
  });

  it('closes every open span with the error', () => {
    const tracing = createAiSdkTracing(tracer);
    tracing.onStart(start);
    tracing.onLanguageModelCallStart({ callId: 'call-1' });
    tracing.onError({ callId: 'call-1', error: new TypeError('fetch failed') });

    expect(spanNamed('chat gemini').status.code).toBe(SpanStatusCode.ERROR);
    expect(spanNamed('invoke_agent gemini').status).toEqual({ code: SpanStatusCode.ERROR, message: 'fetch failed' });
  });

  it('ends the spans of an aborted call without marking an error', () => {
    const tracing = createAiSdkTracing(tracer);
    tracing.onStart(start);
    tracing.onLanguageModelCallStart({ callId: 'call-1' });
    tracing.onAbort({ callId: 'call-1' });

    expect(exporter.getFinishedSpans()).toHaveLength(2);
    expect(spanNamed('invoke_agent gemini').attributes['gen_ai.response.aborted']).toBe(true);
    expect(spanNamed('invoke_agent gemini').status.code).toBe(SpanStatusCode.UNSET);
  });

  it('never records prompts, replies, tool arguments or tool results', () => {
    const tracing = createAiSdkTracing(tracer);
    tracing.onStart({ ...start, messages: [{ role: 'user', content: 'ABC1D23' }] } as typeof start);
    tracing.onToolExecutionStart({
      callId: 'call-1',
      toolCall: { toolCallId: 'tool-1', toolName: 'lookup', input: { plate: 'ABC1D23' } },
    } as Parameters<typeof tracing.onToolExecutionStart>[0]);
    tracing.onToolExecutionEnd(toolResult);
    tracing.onEnd({ callId: 'call-1', text: 'reply' } as Parameters<typeof tracing.onEnd>[0]);

    const recorded = JSON.stringify(exporter.getFinishedSpans().map((span) => span.attributes));
    expect(recorded).not.toContain('ABC1D23');
    expect(recorded).not.toContain('reply');
  });
});
