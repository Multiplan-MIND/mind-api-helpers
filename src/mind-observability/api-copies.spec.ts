import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findNewerApiCopies } from './api-copies';

/** Grava um pacote mínimo (manifesto e ponto de entrada) em `<root>/node_modules/<name>`. */
const writePackage = (root: string, name: string, version: string) => {
  const dir = join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, main: 'index.js' }));
  writeFileSync(join(dir, 'index.js'), '');
  return dir;
};

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

  it('finds nothing when the service has no other copy, or an older one', () => {
    expect(findNewerApiCopies(service, helpersFile)).toEqual([]);
    writePackage(service, '@opentelemetry/api', '1.9.0');
    expect(findNewerApiCopies(service, helpersFile)).toEqual([]);
  });

  it('finds a newer minor at the service root', () => {
    writePackage(service, '@opentelemetry/api', '1.11.2');
    expect(findNewerApiCopies(service, helpersFile)).toEqual(['1.11.2']);
  });

  it('finds a newer minor nested under ai', () => {
    const ai = writePackage(service, 'ai', '7.0.36');
    writePackage(ai, '@opentelemetry/api', '1.12.0');
    expect(findNewerApiCopies(service, helpersFile)).toEqual(['1.12.0']);
  });

  it('ignores another major, which never shares the global', () => {
    writePackage(service, '@opentelemetry/api', '2.0.0');
    expect(findNewerApiCopies(service, helpersFile)).toEqual([]);
  });
});
