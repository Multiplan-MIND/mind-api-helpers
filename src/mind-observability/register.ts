import { startObservability } from './start-observability';

/**
 * Carregue este arquivo antes da aplicação, em serviço CommonJS ou ES module, pelo atalho da raiz do pacote:
 * `node -r mind-api-helpers/observability dist/main.js`. Nada que carregue `mongoose` ou `@nestjs/*` pode vir antes
 * dele, senão as instrumentações não conseguem alterar esses módulos.
 */
startObservability();
