import { createRequire } from 'node:module';
import { registerEsmLoaderHook } from './esm-loader-hook';

jest.mock('node:module', () => ({ createRequire: jest.fn() }));

/** O hook real alteraria o carregamento de módulos do próprio Jest; aqui só a decisão de registrar é testada. */
function mockHooks(supportsSyncHooks: boolean) {
  const hooks = { register: jest.fn(), supportsSyncHooks: () => supportsSyncHooks };
  const requireFromInstrumentation = jest.fn(() => hooks);
  jest.mocked(createRequire).mockReturnValue(requireFromInstrumentation as unknown as NodeJS.Require);
  return { hooks, requireFromInstrumentation };
}

describe('registerEsmLoaderHook', () => {
  afterEach(() => jest.restoreAllMocks());

  it('registers the import-in-the-middle synchronous hooks resolved from @opentelemetry/instrumentation', () => {
    const { hooks, requireFromInstrumentation } = mockHooks(true);
    registerEsmLoaderHook();
    expect(createRequire).toHaveBeenCalledWith(require.resolve('@opentelemetry/instrumentation'));
    expect(requireFromInstrumentation).toHaveBeenCalledWith('import-in-the-middle/register-hooks.mjs');
    expect(hooks.register).toHaveBeenCalledTimes(1);
  });

  it('skips the hook with one line on stderr when Node cannot run synchronous hooks', () => {
    const { hooks } = mockHooks(false);
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    registerEsmLoaderHook();
    expect(hooks.register).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('24.11.1');
  });
});
