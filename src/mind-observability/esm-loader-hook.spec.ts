/**
 * Testes executados:
 * - registra os hooks síncronos do import-in-the-middle resolvidos a partir do @opentelemetry/instrumentation
 * - pula o hook com uma linha no stderr quando o Node não roda hooks síncronos
 */

import { createRequire } from 'node:module';
import { registerEsmLoaderHook } from './esm-loader-hook';

/** O hook real alteraria o carregamento de módulos do próprio Jest; aqui só a decisão de registrar é testada. */

/** Configuração: `createRequire` substituído, para devolver os hooks falsos. */
jest.mock('node:module', () => ({ createRequire: jest.fn() }));

/** Factories/helpers: hooks falsos, com ou sem suporte a hooks síncronos. */
function mockHooks(supportsSyncHooks: boolean) {
  const hooks = { register: jest.fn(), supportsSyncHooks: () => supportsSyncHooks };
  const requireFromInstrumentation = jest.fn(() => hooks);
  jest.mocked(createRequire).mockReturnValue(requireFromInstrumentation as unknown as NodeJS.Require);
  return { hooks, requireFromInstrumentation };
}

/** Testes */
describe('registerEsmLoaderHook', () => {
  afterEach(() => jest.restoreAllMocks());

  it('registra os hooks síncronos do import-in-the-middle resolvidos a partir do @opentelemetry/instrumentation', () => {
    const { hooks, requireFromInstrumentation } = mockHooks(true);
    registerEsmLoaderHook();
    expect(createRequire).toHaveBeenCalledWith(require.resolve('@opentelemetry/instrumentation'));
    expect(requireFromInstrumentation).toHaveBeenCalledWith('import-in-the-middle/register-hooks.mjs');
    expect(hooks.register).toHaveBeenCalledTimes(1);
  });

  it('pula o hook com uma linha no stderr quando o Node não roda hooks síncronos', () => {
    const { hooks } = mockHooks(false);
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    registerEsmLoaderHook();
    expect(hooks.register).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('24.11.1');
  });
});
