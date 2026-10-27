import { loadTracingEnvFile } from './tracing-env-file';
import { startTracing } from './start-tracing';

// Load this file before the application: `node -r mind-api-helpers/dist/mind-tracing/register dist/main.js`, or as the
// first import of main.ts. Nothing that loads `mongoose` or `@nestjs/*` may be loaded before it, or the
// instrumentations cannot patch those modules.
loadTracingEnvFile();
startTracing();
