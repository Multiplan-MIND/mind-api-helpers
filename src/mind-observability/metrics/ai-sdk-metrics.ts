import { Histogram, Meter } from '@opentelemetry/api';
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

/** The AI SDK telemetry integration interface, reduced to the callbacks implemented here. */
export interface AiSdkMetricsIntegration {
  onStart(event: OperationStartEvent): void;
  onLanguageModelCallStart(event: LanguageModelCallStartEvent): void;
  onLanguageModelCallEnd(event: LanguageModelCallEndEvent): void;
  onEnd(event: OperationEndEvent): void;
  onAbort(event: { callId: string }): void;
  onError(error: unknown): void;
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.name : '_OTHER';
}

/**
 * Builds an AI SDK telemetry integration that records, for every model round trip, the GenAI metrics of the semantic
 * conventions: `gen_ai.client.token.usage` (one point per token type) and `gen_ai.client.operation.duration`, with
 * `error.type` when the request fails. Attributes are limited to operation, provider and model, so cardinality stays
 * closed.
 */
export function createAiSdkMetrics(meter: Meter): AiSdkMetricsIntegration {
  const calls = new Map<string, CallState>();
  const tokenUsage: Histogram = meter.createHistogram('gen_ai.client.token.usage', {
    description: 'Number of input and output tokens used',
    unit: '{token}',
  });
  const operationDuration: Histogram = meter.createHistogram('gen_ai.client.operation.duration', {
    description: 'GenAI operation duration',
    unit: 's',
  });

  const endModelCall = (state: CallState, error?: unknown): void => {
    if (!state.modelCall) return;
    const { startedAt, attributes } = state.modelCall;
    operationDuration.record(
      (Date.now() - startedAt) / 1000,
      error === undefined ? attributes : { ...attributes, 'error.type': errorType(error) },
    );
    state.modelCall = undefined;
  };

  return {
    onStart(event) {
      calls.set(event.callId, {
        providerName: mapProviderName(event.provider),
        requestModel: event.modelId ?? 'unknown',
      });
    },

    onLanguageModelCallStart(event) {
      const state = calls.get(event.callId);
      if (!state) return;
      state.modelCall = {
        startedAt: Date.now(),
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
      const state = calls.get(event.callId);
      if (!state) return;
      endModelCall(state);
      calls.delete(event.callId);
    },

    onAbort(event) {
      const state = calls.get(event.callId);
      if (!state) return;
      endModelCall(state);
      calls.delete(event.callId);
    },

    onError(error) {
      const event = error as ErrorEvent;
      const state = event?.callId ? calls.get(event.callId) : undefined;
      if (!state) return;
      endModelCall(state, event.error ?? error);
      calls.delete(event.callId);
    },
  };
}
