/**
 * Testes executados:
 * - escreve o primeiro erro e no máximo uma linha a cada 5 minutos, contando os suprimidos
 * - ignora os níveis diferentes de erro
 * - não instala o logger quando OTEL_LOG_LEVEL está definida
 */

import { diag } from '@opentelemetry/api';
import { registerExportErrorLogger } from './export-error-logger';

/** Testes */
describe('registerExportErrorLogger', () => {
  let write: jest.SpyInstance;
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    clock = 0;
    write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    diag.disable();
    write.mockRestore();
  });

  it('escreve o primeiro erro e no máximo uma linha a cada 5 minutos, contando os suprimidos', () => {
    registerExportErrorLogger({}, now);
    diag.error('first');
    clock = 60_000;
    diag.error('second');
    diag.error('third');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('first');

    clock = 5 * 60_000;
    diag.error('fourth');
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0]).toContain('(2 more errors since the previous line): fourth');
  });

  it('ignora os níveis diferentes de erro', () => {
    registerExportErrorLogger({}, now);
    diag.warn('careful');
    diag.info('fyi');
    expect(write).not.toHaveBeenCalled();
  });

  it('não instala o logger quando OTEL_LOG_LEVEL está definida', () => {
    registerExportErrorLogger({ OTEL_LOG_LEVEL: 'info' }, now);
    diag.error('boom');
    expect(write).not.toHaveBeenCalled();
  });
});
