import { diag, DiagLogLevel } from '@opentelemetry/api';

const REPORT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Falhas de exportação chegam ao tratador de erros do diag do OpenTelemetry, e o NodeSDK só instala um logger de diag
 * quando OTEL_LOG_LEVEL está definida. Sem ele, um endpoint errado ou um coletor fora do ar não escreveriam nada, então
 * este logger escreve no máximo uma linha de erro a cada 5 minutos, com a contagem dos erros suprimidos desde a
 * anterior: um coletor que cai dias depois da partida ainda aparece, e uma queda não inunda o log. Com OTEL_LOG_LEVEL
 * definida, o diagnóstico fica com quem a definiu e nada é instalado.
 */
export function registerExportErrorLogger(env: NodeJS.ProcessEnv, now: () => number = () => performance.now()): void {
  if (env.OTEL_LOG_LEVEL) {
    return;
  }
  let lastReportAt: number | undefined;
  let suppressed = 0;
  const noop = () => undefined;
  diag.setLogger(
    {
      error: (message: string) => {
        const at = now();
        if (lastReportAt !== undefined && at - lastReportAt < REPORT_INTERVAL_MS) {
          suppressed += 1;
          return;
        }
        const suffix = suppressed > 0 ? ` (${suppressed} more errors since the previous line)` : '';
        process.stderr.write(`[mind-observability] OpenTelemetry error${suffix}: ${message}\n`);
        lastReportAt = at;
        suppressed = 0;
      },
      warn: noop,
      info: noop,
      debug: noop,
      verbose: noop,
    },
    DiagLogLevel.ERROR,
  );
}
