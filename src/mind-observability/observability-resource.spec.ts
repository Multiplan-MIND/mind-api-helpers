import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectResources, envDetector } from '@opentelemetry/resources';
import { createDefaultResource, createResourceDetectors } from './observability-resource';

describe('observability-resource', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mind-observability-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('takes service.name and service.version from the package.json in the working directory', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'mind-api-concierge', version: '0.7.0' }));
    expect(createDefaultResource(dir).attributes).toMatchObject({
      'service.name': 'mind-api-concierge',
      'service.version': '0.7.0',
    });
  });

  it('falls back to the default service name without a readable package.json', () => {
    expect(createDefaultResource(dir).attributes['service.name']).toMatch(/^unknown_service/);
    writeFileSync(join(dir, 'package.json'), '{ not json');
    expect(createDefaultResource(dir).attributes['service.name']).toMatch(/^unknown_service/);
  });

  it('detects the service instance and the process, without the command line, and lets the env win', () => {
    const detectors = createResourceDetectors({});
    expect(detectors[detectors.length - 1]).toBe(envDetector);
    const attributes = detectResources({ detectors }).attributes;
    expect(attributes['service.instance.id']).toEqual(expect.any(String));
    expect(attributes['process.pid']).toBe(process.pid);
    expect(attributes).not.toHaveProperty('process.command_args');
    expect(attributes).not.toHaveProperty('process.command_line');
  });

  it('uses the official list when OTEL_NODE_RESOURCE_DETECTORS is set', () => {
    const previous = process.env.OTEL_NODE_RESOURCE_DETECTORS;
    process.env.OTEL_NODE_RESOURCE_DETECTORS = 'env';
    try {
      expect(createResourceDetectors(process.env)).toEqual([envDetector]);
    } finally {
      if (previous === undefined) delete process.env.OTEL_NODE_RESOURCE_DETECTORS;
      else process.env.OTEL_NODE_RESOURCE_DETECTORS = previous;
    }
  });
});
