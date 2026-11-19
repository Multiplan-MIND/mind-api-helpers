const MAX_CALL_AGE_MS = 10 * 60 * 1000;
const MAX_OPEN_CALLS = 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

/** `error.type` de uma chamada que expirou antes de o AI SDK avisar o fim. */
export const CALL_TIMEOUT_ERROR_TYPE = 'timeout';

export interface AiSdkCallsOptions {
  maxAgeMs?: number;
  maxOpenCalls?: number;
  now?: () => number;
}

interface OpenCall<T> {
  state: T;
  startedAt: number;
}

/**
 * Chamadas do AI SDK em andamento, por `callId`, com o estado que cada integração guarda delas. Compartilhado pelas
 * integrações de tracing e de métricas, que só diferem nesse estado. Uma chamada sai em `finish` (fim, aborto ou erro).
 * Quando o AI SDK não avisa nenhum dos três (um stream que ninguém lê até o fim, uma exceção num callback do serviço),
 * a chamada expira depois de 10 minutos, ou como a mais antiga quando há 1000 abertas, e `onExpire` fecha o que ficou
 * aberto. Sem isso, a memória cresceria pela vida inteira do processo.
 */
export class AiSdkCalls<T> {
  private readonly calls = new Map<string, OpenCall<T>>();
  private readonly maxAgeMs: number;
  private readonly maxOpenCalls: number;
  private readonly now: () => number;

  constructor(
    private readonly onExpire: (state: T) => void,
    options: AiSdkCallsOptions = {},
  ) {
    this.maxAgeMs = options.maxAgeMs ?? MAX_CALL_AGE_MS;
    this.maxOpenCalls = options.maxOpenCalls ?? MAX_OPEN_CALLS;
    this.now = options.now ?? (() => performance.now());
    setInterval(() => this.sweep(), SWEEP_INTERVAL_MS).unref();
  }

  start(callId: string, state: T): void {
    /** Apagar antes mantém o mapa na ordem de início, da qual o `sweep` depende. */
    this.calls.delete(callId);
    if (this.calls.size >= this.maxOpenCalls) {
      const [oldest] = this.calls.keys();
      this.expire(oldest);
    }
    this.calls.set(callId, { state, startedAt: this.now() });
  }

  get(callId: string): T | undefined {
    return this.calls.get(callId)?.state;
  }

  /** Remove a chamada e devolve o estado dela, ou undefined para uma chamada desconhecida. */
  finish(callId: string): T | undefined {
    const state = this.get(callId);
    this.calls.delete(callId);
    return state;
  }

  /** Expira as chamadas mais velhas que a idade máxima. O mapa está na ordem de início, então para na primeira nova. */
  sweep(): void {
    const limit = this.now() - this.maxAgeMs;
    for (const [callId, call] of this.calls) {
      if (call.startedAt > limit) {
        return;
      }
      this.expire(callId);
    }
  }

  private expire(callId: string): void {
    const state = this.finish(callId);
    if (state !== undefined) {
      this.onExpire(state);
    }
  }
}
