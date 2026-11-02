import { Histogram, Meter } from '@opentelemetry/api';
import { AiSdkCalls, AiSdkCallsOptions, CALL_TIMEOUT_ERROR_TYPE } from '../ai-sdk-calls';
import {
  ErrorEvent,
  LanguageModelCallEndEvent,
  LanguageModelCallStartEvent,
  mapProviderName,
  OperationEndEvent,
  OperationStartEvent,
} from '../ai-sdk-telemetry';

interface CallState {
  providerName: string;
  requestModel: string;
  modelCall?: { startedAt: number; attributes: Record<string, string> };
}

/** A interface de integração de telemetria do AI SDK, reduzida aos callbacks implementados aqui. */
export interface AiSdkMetricsIntegration {
  onStart(event: OperationStartEvent): void;
  onLanguageModelCallStart(event: LanguageModelCallStartEvent): void;
  onLanguageModelCallEnd(event: LanguageModelCallEndEvent): void;
  onEnd(event: OperationEndEvent): void;
  onAbort(event: { callId: string }): void;
  onError(error: unknown): void;
}

function errorTypeOf(error: unknown): string {
  return error instanceof Error ? error.name : '_OTHER';
}

/**
 * Monta uma integração de telemetria do AI SDK que registra, a cada ida ao modelo, as métricas GenAI das convenções
 * semânticas: `gen_ai.client.token.usage` (um ponto por tipo de token) e `gen_ai.client.operation.duration`, com
 * `error.type` quando a requisição falha ou nunca termina. Os atributos se limitam a operação, provedor e modelo, para
 * a cardinalidade ficar fechada. As durações vêm do relógio monotônico, que ajustes de relógio não movem.
 */
export function createAiSdkMetrics(meter: Meter, options?: AiSdkCallsOptions): AiSdkMetricsIntegration {
  const tokenUsage: Histogram = meter.createHistogram('gen_ai.client.token.usage', {
    description: 'Number of input and output tokens used',
    unit: '{token}',
  });
  const operationDuration: Histogram = meter.createHistogram('gen_ai.client.operation.duration', {
    description: 'GenAI operation duration',
    unit: 's',
  });

  const endModelCall = (state: CallState, errorType?: string): void => {
    if (!state.modelCall) return;
    const { startedAt, attributes } = state.modelCall;
    operationDuration.record(
      (performance.now() - startedAt) / 1000,
      errorType === undefined ? attributes : { ...attributes, 'error.type': errorType },
    );
    state.modelCall = undefined;
  };

  const calls = new AiSdkCalls<CallState>((state) => endModelCall(state, CALL_TIMEOUT_ERROR_TYPE), options);

  return {
    onStart(event) {
      calls.start(event.callId, {
        providerName: mapProviderName(event.provider),
        requestModel: event.modelId ?? 'unknown',
      });
    },

    onLanguageModelCallStart(event) {
      const state = calls.get(event.callId);
      if (!state) return;
      state.modelCall = {
        startedAt: performance.now(),
        attributes: {
          'gen_ai.operation.name': 'chat',
          'gen_ai.provider.name': event.provider ? mapProviderName(event.provider) : state.providerName,
          'gen_ai.request.model': event.modelId ?? state.requestModel,
        },
      };
    },

    onLanguageModelCallEnd(event) {
      const state = calls.get(event.callId);
      if (!state?.modelCall) return;
      const attributes = state.modelCall.attributes;
      if (event.modelId) attributes['gen_ai.response.model'] = event.modelId;
      if (event.usage?.inputTokens != null) {
        tokenUsage.record(event.usage.inputTokens, { ...attributes, 'gen_ai.token.type': 'input' });
      }
      if (event.usage?.outputTokens != null) {
        tokenUsage.record(event.usage.outputTokens, { ...attributes, 'gen_ai.token.type': 'output' });
      }
      endModelCall(state);
    },

    onEnd(event) {
      const state = calls.finish(event.callId);
      if (!state) return;
      endModelCall(state);
    },

    onAbort(event) {
      const state = calls.finish(event.callId);
      if (!state) return;
      endModelCall(state);
    },

    onError(error) {
      const event = error as ErrorEvent;
      const state = event?.callId ? calls.finish(event.callId) : undefined;
      if (!state) return;
      endModelCall(state, errorTypeOf(event.error ?? error));
    },
  };
}
