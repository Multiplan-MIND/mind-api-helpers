import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadObservabilityEnvFile } from './observability-env-file';

describe('loadObservabilityEnvFile', () => {
  let directory: string;
  let envFile: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'mind-observability-'));
    envFile = join(directory, '.env');
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('copies only the OTEL_ and TRACING_ variables', () => {
    writeFileSync(
      envFile,
      'OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318\nTRACING_IGNORE_PATHS=/ping\nMONGO_HOSTS=db:27017\n',
    );
    const env: NodeJS.ProcessEnv = {};
    loadObservabilityEnvFile(envFile, env);
    expect(env).toEqual({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318', TRACING_IGNORE_PATHS: '/ping' });
  });

  it('keeps values already set in the environment', () => {
    writeFileSync(envFile, 'OTEL_SERVICE_NAME=from-file\n');
    const env: NodeJS.ProcessEnv = { OTEL_SERVICE_NAME: 'from-environment' };
    loadObservabilityEnvFile(envFile, env);
    expect(env.OTEL_SERVICE_NAME).toBe('from-environment');
  });

  it('does nothing without the file', () => {
    const env: NodeJS.ProcessEnv = {};
    loadObservabilityEnvFile(join(directory, 'missing.env'), env);
    expect(env).toEqual({});
  });

  it('writes one stderr line and keeps going when the file cannot be read', () => {
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const env: NodeJS.ProcessEnv = {};
    loadObservabilityEnvFile(directory, env);
    expect(env).toEqual({});
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });
});
