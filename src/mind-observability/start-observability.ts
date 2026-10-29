import type { NodeSDK } from '@opentelemetry/sdk-node';
import type * as ObservabilitySdk from './observability-sdk';

/**
 * A telemetria liga quando OTEL_EXPORTER_OTLP_ENDPOINT está definida e OTEL_SDK_DISABLED, o switch padrão do
 * OpenTelemetry, não é "true" (em qualquer caixa, como a especificação lê booleanos). Sem endpoint não há para onde
 * mandar, então um serviço sem nenhuma variável do OpenTelemetry fica desligado.
 */
export function isObservabilityEnabled(env: NodeJS.ProcessEnv): boolean {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const disabled = env.OTEL_SDK_DISABLED?.trim().toLowerCase() === 'true';
  return Boolean(endpoint) && !disabled;
}

/**
 * Inicia o OpenTelemetry quando `isObservabilityEnabled`; senão, não faz nada e não carrega nada do SDK. O módulo do
 * SDK é carregado por `module.require` só depois dessa checagem, porque um import estático o carregaria em todo
 * serviço, ligado ou não, e um `import()` só resolveria depois de a aplicação ter carregado os módulos a alterar. Uma
 * falha do SDK vai para o stderr e nunca para a aplicação.
 */
export function startObservability(env: NodeJS.ProcessEnv = process.env): NodeSDK | undefined {
  if (!isObservabilityEnabled(env)) {
    return undefined;
  }
  try {
    const { startObservabilitySdk }: typeof ObservabilitySdk = module.require('./observability-sdk');
    return startObservabilitySdk(env);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `[mind-observability] failed to start OpenTelemetry, continuing without telemetry: ${message}\n`,
    );
    return undefined;
  }
}
