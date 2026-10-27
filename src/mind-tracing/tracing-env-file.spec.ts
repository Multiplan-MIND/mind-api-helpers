import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadTracingEnvFile } from './tracing-env-file';

describe('loadTracingEnvFile', () => {
  let directory: string;
  let envFile: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'mind-tracing-'));
    envFile = join(directory, '.env');
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('copies only the OTEL_ and MIND_TRACING_ variables', () => {
    writeFileSync(
      envFile,
      'OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318\nMIND_TRACING_IGNORE_PATHS=/ping\nMONGO_HOSTS=db:27017\n',
    );
    const env: NodeJS.ProcessEnv = {};
    loadTracingEnvFile(envFile, env);
    expect(env).toEqual({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318', MIND_TRACING_IGNORE_PATHS: '/ping' });
  });

  it('keeps values already set in the environment', () => {
    writeFileSync(envFile, 'OTEL_SERVICE_NAME=from-file\n');
    const env: NodeJS.ProcessEnv = { OTEL_SERVICE_NAME: 'from-environment' };
    loadTracingEnvFile(envFile, env);
    expect(env.OTEL_SERVICE_NAME).toBe('from-environment');
  });

  it('does nothing without the file', () => {
    const env: NodeJS.ProcessEnv = {};
    loadTracingEnvFile(join(directory, 'missing.env'), env);
    expect(env).toEqual({});
  });

  it('writes one stderr line and keeps going when the file cannot be read', () => {
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const env: NodeJS.ProcessEnv = {};
    loadTracingEnvFile(directory, env);
    expect(env).toEqual({});
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });
});
