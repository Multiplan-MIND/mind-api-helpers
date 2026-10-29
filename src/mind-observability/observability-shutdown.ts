const SHUTDOWN_TIMEOUT_MS = 5000;
const SIGNALS: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

interface Flushable {
  shutdown(): Promise<void>;
}

let shutdown: () => Promise<void> = () => Promise.resolve();

/**
 * Descarrega os spans e as métricas pendentes e encerra o SDK, esperando no máximo 5 s. Chamar de novo devolve a mesma
 * promise. Com a telemetria desligada, não faz nada. Um serviço que encerra o processo por conta própria
 * (`process.exit` num hook de shutdown) chama esta função antes, por exemplo no `onApplicationShutdown` do NestJS.
 */
export function shutdownObservability(): Promise<void> {
  return shutdown();
}

/**
 * Descarrega no SIGTERM, no SIGINT e no `beforeExit`. Um listener de sinal desliga a saída padrão do Node, então,
 * depois do descarregamento, o listener se remove e reenvia o sinal quando ninguém mais escuta. O listener fica
 * registrado enquanto o descarregamento corre: quando os hooks de shutdown do NestJS terminam antes e reenviam o sinal,
 * ele cai aqui em vez de matar o processo no meio do descarregamento.
 */
export function registerShutdown(sdk: Flushable): void {
  let flushing: Promise<void> | undefined;
  shutdown = () => {
    flushing ??= flushWithTimeout(sdk);
    return flushing;
  };

  const listeners = SIGNALS.map((signal) => {
    const listener = () => {
      /** Nenhum dos dois lados do descarregamento rejeita, então não sobra nada a tratar depois do reenvio. */
      void shutdown().then(() => {
        listeners.forEach(([name, registered]) => process.removeListener(name, registered));
        if (process.listenerCount(signal) === 0) {
          process.kill(process.pid, signal);
        }
      });
    };
    return [signal, listener] as const;
  });
  listeners.forEach(([signal, listener]) => process.on(signal, listener));
  process.once('beforeExit', () => void shutdown());
}

function flushWithTimeout(sdk: Flushable): Promise<void> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
  });
  return Promise.race([sdk.shutdown().catch(() => undefined), timeout]).then(() => clearTimeout(timer));
}
