/**
 * Testes executados:
 * - não encontra nada quando o serviço não tem outra cópia, ou tem uma mais antiga
 * - encontra uma minor mais nova na raiz do serviço
 * - encontra uma minor mais nova dentro do ai
 * - ignora outra major, que nunca compartilha o global
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findNewerApiCopies } from './api-copies';

/** Factories/helpers: grava um pacote mínimo (manifesto e ponto de entrada) em `<root>/node_modules/<name>`. */
const writePackage = (root: string, name: string, version: string) => {
  const dir = join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, main: 'index.js' }));
  writeFileSync(join(dir, 'index.js'), '');
  return dir;
};

/** Testes */
describe('findNewerApiCopies', () => {
  let service: string;
  let helpersFile: string;

  beforeEach(() => {
    service = mkdtempSync(join(tmpdir(), 'mind-observability-'));
    writeFileSync(join(service, 'package.json'), JSON.stringify({ name: 'service' }));
    const helpers = writePackage(service, 'mind-api-helpers', '2.0.0');
    writePackage(helpers, '@opentelemetry/api', '1.10.0');
    helpersFile = join(helpers, 'index.js');
  });

  afterEach(() => rmSync(service, { recursive: true, force: true }));

  it('não encontra nada quando o serviço não tem outra cópia, ou tem uma mais antiga', () => {
    expect(findNewerApiCopies(service, helpersFile)).toEqual([]);
    writePackage(service, '@opentelemetry/api', '1.9.0');
    expect(findNewerApiCopies(service, helpersFile)).toEqual([]);
  });

  it('encontra uma minor mais nova na raiz do serviço', () => {
    writePackage(service, '@opentelemetry/api', '1.11.2');
    expect(findNewerApiCopies(service, helpersFile)).toEqual(['1.11.2']);
  });

  it('encontra uma minor mais nova dentro do ai', () => {
    const ai = writePackage(service, 'ai', '7.0.36');
    writePackage(ai, '@opentelemetry/api', '1.12.0');
    expect(findNewerApiCopies(service, helpersFile)).toEqual(['1.12.0']);
  });

  it('ignora outra major, que nunca compartilha o global', () => {
    writePackage(service, '@opentelemetry/api', '2.0.0');
    expect(findNewerApiCopies(service, helpersFile)).toEqual([]);
  });
});
