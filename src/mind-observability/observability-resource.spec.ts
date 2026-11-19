/**
 * Testes executados:
 * - lê service.name e service.version do package.json do diretório de trabalho
 * - usa o nome de serviço padrão sem um package.json legível
 * - detecta a instância do serviço e o processo, sem a linha de comando, e deixa o env vencer
 * - usa a lista oficial quando OTEL_NODE_RESOURCE_DETECTORS está definida
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectResources, envDetector } from '@opentelemetry/resources';
import { createDefaultResource, createResourceDetectors } from './observability-resource';

/** Testes */
describe('observability-resource', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mind-observability-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lê service.name e service.version do package.json do diretório de trabalho', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'mind-api-exemplo', version: '1.2.3' }));
    expect(createDefaultResource(dir).attributes).toMatchObject({
      'service.name': 'mind-api-exemplo',
      'service.version': '1.2.3',
    });
  });

  it('usa o nome de serviço padrão sem um package.json legível', () => {
    expect(createDefaultResource(dir).attributes['service.name']).toMatch(/^unknown_service/);
    writeFileSync(join(dir, 'package.json'), '{ not json');
    expect(createDefaultResource(dir).attributes['service.name']).toMatch(/^unknown_service/);
  });

  it('detecta a instância do serviço e o processo, sem a linha de comando, e deixa o env vencer', () => {
    const detectors = createResourceDetectors({});
    expect(detectors[detectors.length - 1]).toBe(envDetector);
    const attributes = detectResources({ detectors }).attributes;
    expect(attributes['service.instance.id']).toEqual(expect.any(String));
    expect(attributes['process.pid']).toBe(process.pid);
    expect(attributes).not.toHaveProperty('process.command_args');
    expect(attributes).not.toHaveProperty('process.command_line');
  });

  it('usa a lista oficial quando OTEL_NODE_RESOURCE_DETECTORS está definida', () => {
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
