import { diag } from '@opentelemetry/api';
import { registerExportErrorLogger } from './export-error-logger';

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

  it('writes the first error and at most one line every 5 minutes, counting the suppressed ones', () => {
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

  it('ignores levels other than error', () => {
    registerExportErrorLogger({}, now);
    diag.warn('careful');
    diag.info('fyi');
    expect(write).not.toHaveBeenCalled();
  });

  it('does not install the logger when OTEL_LOG_LEVEL is set', () => {
    registerExportErrorLogger({ OTEL_LOG_LEVEL: 'info' }, now);
    diag.error('boom');
    expect(write).not.toHaveBeenCalled();
  });
});
