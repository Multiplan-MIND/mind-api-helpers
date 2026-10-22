import { startTracing } from './start-tracing';

// Import this file before anything else in main.ts: nothing that loads `mongoose` or `@nestjs/*` may be
// imported before it, or the instrumentations cannot patch those modules.
startTracing();
