/**
 * Testes executados:
 * - monta um span invoke_agent com um filho chat e um filho execute_tool, sob o span ativo
 * - roda a requisição ao modelo dentro do span chat e a ferramenta dentro do span da ferramenta
 * - roda o execute sem alteração para uma chamada desconhecida
 * - marca como erro uma execução de ferramenta que falhou
 * - fecha todo span aberto com o erro
 * - encerra os spans de uma chamada abortada sem marcar erro
 * - nomeia chat o span raiz quando a chamada não tem ferramentas
 * - fecha como erro de timeout uma chamada que o AI SDK nunca encerrou, inclusive os filhos abertos
 * - nunca grava prompt, resposta, argumentos nem resultado de ferramenta
 */

import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { InMemorySpanExporter, ReadableSpan, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { createAiSdkTracing } from './ai-sdk-tracing';

/** Configuração: tracer real com exportador em memória e contexto por AsyncLocalStorage. */
const exporter = new InMemorySpanExporter();
const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
const tracer = provider.getTracer('test');
const contextManager = new AsyncLocalStorageContextManager();

/** Factories/helpers: busca de span exportado pelo nome e id do pai. */
const spanNamed = (name: string): ReadableSpan => exporter.getFinishedSpans().find((span) => span.name === name);
const parentOf = (span: ReadableSpan) => span.parentSpanContext?.spanId;

/** Fixtures: início de uma chamada com ferramentas e o resultado de uma ferramenta. */
const start = {
  callId: 'call-1',
  operationId: 'ai.generateText',
  provider: 'google.generative-ai',
  modelId: 'gemini',
  tools: { createOrder: {}, lookup: {} },
};
const toolResult = { callId: 'call-1', toolCall: { toolCallId: 'tool-1' }, toolOutput: { type: 'tool-result' } };

/** Testes */
describe('createAiSdkTracing', () => {
  beforeAll(() => context.setGlobalContextManager(contextManager.enable()));

  afterAll(() => context.disable());

  beforeEach(() => exporter.reset());

  it('monta um span invoke_agent com um filho chat e um filho execute_tool, sob o span ativo', () => {
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
    tracing.onToolExecutionStart({ callId: 'call-1', toolCall: { toolCallId: 'tool-1', toolName: 'createOrder' } });
    tracing.onToolExecutionEnd(toolResult);
    tracing.onEnd({ callId: 'call-1', finishReason: 'stop', usage: { inputTokens: 200, outputTokens: 50 } });
    parent.end();

    const root = spanNamed('invoke_agent gemini');
    const chat = spanNamed('chat gemini');
    const tool = spanNamed('execute_tool createOrder');
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
    expect(tool.attributes).toMatchObject({ 'gen_ai.tool.name': 'createOrder', 'gen_ai.tool.type': 'function' });
    expect(tool.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('roda a requisição ao modelo dentro do span chat e a ferramenta dentro do span da ferramenta', async () => {
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

  it('roda o execute sem alteração para uma chamada desconhecida', async () => {
    const tracing = createAiSdkTracing(tracer);
    await expect(tracing.executeLanguageModelCall({ callId: 'missing', execute: async () => 'ok' })).resolves.toBe(
      'ok',
    );
    await expect(tracing.executeTool({ callId: 'missing', toolCallId: 't', execute: async () => 'ok' })).resolves.toBe(
      'ok',
    );
    expect(() => tracing.onEnd({ callId: 'missing' })).not.toThrow();
  });

  it('marca como erro uma execução de ferramenta que falhou', () => {
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

  it('fecha todo span aberto com o erro', () => {
    const tracing = createAiSdkTracing(tracer);
    tracing.onStart(start);
    tracing.onLanguageModelCallStart({ callId: 'call-1' });
    tracing.onError({ callId: 'call-1', error: new TypeError('fetch failed') });

    expect(spanNamed('chat gemini').status.code).toBe(SpanStatusCode.ERROR);
    expect(spanNamed('invoke_agent gemini').status).toEqual({ code: SpanStatusCode.ERROR, message: 'fetch failed' });
  });

  it('encerra os spans de uma chamada abortada sem marcar erro', () => {
    const tracing = createAiSdkTracing(tracer);
    tracing.onStart(start);
    tracing.onLanguageModelCallStart({ callId: 'call-1' });
    tracing.onAbort({ callId: 'call-1' });

    expect(exporter.getFinishedSpans()).toHaveLength(2);
    expect(spanNamed('invoke_agent gemini').attributes['gen_ai.response.aborted']).toBe(true);
    expect(spanNamed('invoke_agent gemini').status.code).toBe(SpanStatusCode.UNSET);
  });

  it('nomeia chat o span raiz quando a chamada não tem ferramentas', () => {
    const tracing = createAiSdkTracing(tracer);
    tracing.onStart({ ...start, tools: undefined });
    tracing.onLanguageModelCallStart({ callId: 'call-1' });
    tracing.onLanguageModelCallEnd({ callId: 'call-1' });
    tracing.onEnd({ callId: 'call-1' });

    const chatSpans = exporter.getFinishedSpans().filter((span) => span.name === 'chat gemini');
    expect(chatSpans).toHaveLength(2);
    expect(chatSpans.map((span) => span.attributes['gen_ai.operation.name'])).toEqual(['chat', 'chat']);
  });

  it('fecha como erro de timeout uma chamada que o AI SDK nunca encerrou, inclusive os filhos abertos', () => {
    const tracing = createAiSdkTracing(tracer, { maxOpenCalls: 1 });
    tracing.onStart(start);
    tracing.onLanguageModelCallStart({ callId: 'call-1' });
    tracing.onStart({ ...start, callId: 'call-2' });

    const root = spanNamed('invoke_agent gemini');
    expect(root.status.code).toBe(SpanStatusCode.ERROR);
    expect(root.attributes['error.type']).toBe('timeout');
    expect(spanNamed('chat gemini').status.code).toBe(SpanStatusCode.ERROR);
    expect(() => tracing.onEnd({ callId: 'call-1' })).not.toThrow();
    expect(exporter.getFinishedSpans()).toHaveLength(2);
  });

  it('nunca grava prompt, resposta, argumentos nem resultado de ferramenta', () => {
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
