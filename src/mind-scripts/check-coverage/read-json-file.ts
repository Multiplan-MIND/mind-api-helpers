import { readFileSync } from 'node:fs';

/** O erro do `JSON.parse` não diz o arquivo; a mensagem passa a nomeá-lo. */
export function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${(error as Error).message}`);
  }
}
