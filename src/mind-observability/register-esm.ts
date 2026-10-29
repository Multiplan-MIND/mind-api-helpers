import { startObservability } from './start-observability';

/**
 * Carregue este arquivo antes da aplicação de um serviço em ES module:
 * `node --env-file-if-exists=.env --import mind-api-helpers/dist/mind-observability/register-esm dist/main.js`. Além do
 * que o `register` faz, registra o hook de carregamento que deixa as instrumentações alterarem os módulos carregados
 * por `import`.
 */
startObservability(process.env, { esm: true });
