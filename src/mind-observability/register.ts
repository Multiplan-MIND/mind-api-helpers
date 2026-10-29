import { startObservability } from './start-observability';

/**
 * Carregue este arquivo antes da aplicação de um serviço CommonJS:
 * `node --env-file-if-exists=.env -r mind-api-helpers/dist/mind-observability/register dist/main.js`. Nada que carregue
 * `mongoose` ou `@nestjs/*` pode vir antes dele, senão as instrumentações não conseguem alterar esses módulos. Serviços
 * em ES module usam o `register-esm` com `--import`.
 */
startObservability();
