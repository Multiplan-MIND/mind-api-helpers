import { createRequire } from 'node:module';

interface RegisterHooks {
  register(): void;
  supportsSyncHooks(): boolean;
}

/**
 * Hook síncrono do import-in-the-middle (`module.registerHooks`, que substitui o `module.register` deprecated). Por
 * ser síncrono, funciona carregado pelo `-r`, então um só `register` instrumenta serviços CommonJS e ES module. Ele é
 * resolvido a partir do @opentelemetry/instrumentation para o hook e os `Hook()` das instrumentações usarem a mesma
 * cópia. Antes do Node 24.11.1 o hook não roda: avisa no stderr e segue só com os módulos carregados por `require`.
 */
export function registerEsmLoaderHook(): void {
  const requireFromInstrumentation = createRequire(require.resolve('@opentelemetry/instrumentation'));
  const hooks: RegisterHooks = requireFromInstrumentation('import-in-the-middle/register-hooks.mjs');
  if (!hooks.supportsSyncHooks()) {
    process.stderr.write(
      `[mind-observability] Node ${process.version} cannot run the ESM loader hook (needs >= 24.11.1); ` +
        'modules loaded with import are not instrumented\n',
    );
    return;
  }
  hooks.register();
}
