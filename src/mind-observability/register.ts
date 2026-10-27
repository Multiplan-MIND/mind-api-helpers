import { loadObservabilityEnvFile } from './observability-env-file';
import { startObservability } from './start-observability';

// Load this file before the application: `node -r mind-api-helpers/dist/mind-observability/register dist/main.js`, or as the
// first import of main.ts. Nothing that loads `mongoose` or `@nestjs/*` may be loaded before it, or the
// instrumentations cannot patch those modules.
loadObservabilityEnvFile();
startObservability();
