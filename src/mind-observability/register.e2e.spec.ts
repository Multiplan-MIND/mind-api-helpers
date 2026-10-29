import { execFileSync, spawn } from 'node:child_process';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';

/**
 * Ponta a ponta: compila a biblioteca, sobe um serviço real, CommonJS e ES module, com `-r register` e confere o
 * que chega a um receptor OTLP em memória. As outras specs simulam o SDK; esta falha quando uma atualização, uma troca
 * de dependência ou uma segunda cópia da API desliga a telemetria em silêncio.
 */

interface OtlpAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string | number };
}

interface OtlpSpan {
  name: string;
  kind: number;
  attributes: OtlpAttribute[];
}

interface Received {
  resource: Record<string, string | number>;
  spans: OtlpSpan[];
  metricNames: string[];
}

const SPAN_KIND_SERVER = 2;
const SPAN_KIND_CLIENT = 3;

const root = resolve(__dirname, '../..');
const outDir = join(root, 'node_modules/.cache/mind-observability-e2e');
const serviceDir = join(__dirname, '__fixtures__/service');

const attributesOf = (list: OtlpAttribute[] = []) =>
  Object.fromEntries(list.map(({ key, value }) => [key, value.stringValue ?? Number(value.intValue)]));

function startReceiver(received: Received): Promise<Server> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const payload = JSON.parse(body || '{}');
      for (const resourceSpans of payload.resourceSpans ?? []) {
        Object.assign(received.resource, attributesOf(resourceSpans.resource?.attributes));
        for (const scopeSpans of resourceSpans.scopeSpans ?? []) received.spans.push(...scopeSpans.spans);
      }
      for (const resourceMetrics of payload.resourceMetrics ?? []) {
        for (const scopeMetrics of resourceMetrics.scopeMetrics ?? []) {
          received.metricNames.push(...scopeMetrics.metrics.map((metric: { name: string }) => metric.name));
        }
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

async function runService(args: string[], env: NodeJS.ProcessEnv): Promise<{ received: Received; stdout: string }> {
  const received: Received = { resource: {}, spans: [], metricNames: [] };
  const receiver = await startReceiver(received);
  const { port } = receiver.address() as AddressInfo;
  let stdout = '';
  await new Promise<void>((done, fail) => {
    const child = spawn(process.execPath, args, {
      cwd: serviceDir,
      env: {
        PATH: process.env.PATH,
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
        ...env,
      },
    });
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', fail);
    child.on('exit', () => done());
  });
  await new Promise((done) => receiver.close(done));
  return { received, stdout };
}

const spanOfKind = (received: Received, kind: number) => received.spans.find((span) => span.kind === kind);

describe('register (end to end)', () => {
  beforeAll(() => {
    execFileSync(
      process.execPath,
      [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json', '--outDir', outDir],
      {
        cwd: root,
      },
    );
  }, 120_000);

  it('sends masked spans, process and runtime metrics and the service resource from a CommonJS service', async () => {
    const { received, stdout } = await runService(
      ['-r', join(outDir, 'mind-observability/register.js'), 'server.cjs'],
      {},
    );

    expect(stdout).toContain('sdk-loaded=true');
    expect(received.resource).toMatchObject({
      'service.name': 'mind-observability-e2e-service',
      'service.version': '1.2.3',
    });
    expect(received.resource['service.instance.id']).toEqual(expect.any(String));
    expect(received.resource).not.toHaveProperty('process.command_args');

    const server = attributesOf(spanOfKind(received, SPAN_KIND_SERVER)?.attributes);
    expect(server['url.path']).toBe('/customers/<redacted>');
    expect(server['url.query']).toBe('email=<redacted>');
    const client = attributesOf(spanOfKind(received, SPAN_KIND_CLIENT)?.attributes);
    expect(client['url.full']).toMatch(/\/customers\/<redacted>\?email=<redacted>$/);

    expect(received.metricNames).toEqual(
      expect.arrayContaining(['http.server.request.duration', 'process.cpu.time', 'process.memory.usage']),
    );
    expect(received.metricNames.some((name) => name.startsWith('v8js.') || name.startsWith('nodejs.'))).toBe(true);
  }, 60_000);

  it('instruments modules loaded with import in an ES module service', async () => {
    const { received, stdout } = await runService(
      ['-r', join(outDir, 'mind-observability/register.js'), 'server.mjs'],
      {},
    );

    expect(stdout).toContain('esm-patched=true');
    expect(spanOfKind(received, SPAN_KIND_SERVER)).toBeDefined();
    expect(spanOfKind(received, SPAN_KIND_CLIENT)).toBeDefined();
  }, 60_000);

  it('sends nothing and does not load the SDK when OTEL_SDK_DISABLED is true', async () => {
    const { received, stdout } = await runService(
      ['-r', join(outDir, 'mind-observability/register.js'), 'server.cjs'],
      { OTEL_SDK_DISABLED: 'true' },
    );

    expect(stdout).toContain('sdk-loaded=false');
    expect(received.spans).toEqual([]);
    expect(received.metricNames).toEqual([]);
  }, 60_000);
});
