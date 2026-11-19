/**
 * Testes executados:
 * - convertImports
 *   - troca o import relativo pelo alias do módulo que o cobre
 *   - converte o export com from e o import só de efeito
 *   - preserva as aspas, o resto da linha e as quebras de linha
 *   - usa o alias seguinte quando o import aponta a própria pasta de um alias
 *   - mantém o import relativo que nenhum alias cobre
 *   - não mexe em import de pacote nem em import que já usa alias
 */

import { join } from 'node:path';

import { AliasMapping } from './alias-mappings';
import { convertImports } from './import-conversion';

/** Fixtures */
const PROJECT_DIRECTORY = join('/', 'project');

const MAPPINGS: AliasMapping[] = [
  { aliasPrefix: '@bot/', targetDirectory: join(PROJECT_DIRECTORY, 'src', 'bot') },
  { aliasPrefix: '@app/', targetDirectory: join(PROJECT_DIRECTORY, 'src') },
];

const FILE_PATH = join(PROJECT_DIRECTORY, 'src', 'contacts', 'contacts.service.ts');

/** Factories/helpers */
function convert(content: string) {
  return convertImports(content, FILE_PATH, MAPPINGS);
}

/** Testes */
describe('convertImports', () => {
  it('troca o import relativo pelo alias do módulo que o cobre', () => {
    expect(convert("import { BotService } from '../bot/bot.service';")).toEqual({
      content: "import { BotService } from '@bot/bot.service';",
      convertedCount: 1,
    });
    expect(convert("import { Contact } from './contact.entity';").content).toBe(
      "import { Contact } from '@app/contacts/contact.entity';",
    );
  });

  it('converte o export com from e o import só de efeito', () => {
    expect(convert("export * from '../bot/bot.types';\nimport '../bot/setup';")).toEqual({
      content: "export * from '@bot/bot.types';\nimport '@bot/setup';",
      convertedCount: 2,
    });
  });

  it('preserva as aspas, o resto da linha e as quebras de linha', () => {
    const content = 'import { a } from "../bot/a"; /** a */\r\nimport {\r\n  b,\r\n} from "../bot/b";\r\n';

    expect(convert(content).content).toBe(
      'import { a } from "@bot/a"; /** a */\r\nimport {\r\n  b,\r\n} from "@bot/b";\r\n',
    );
  });

  it('usa o alias seguinte quando o import aponta a própria pasta de um alias', () => {
    expect(convert("import { bot } from '../bot';").content).toBe("import { bot } from '@app/bot';");
  });

  it('mantém o import relativo que nenhum alias cobre', () => {
    const content = "import { config } from '../../config/app.config';";

    expect(convert(content)).toEqual({ content, convertedCount: 0 });
  });

  it('não mexe em import de pacote nem em import que já usa alias', () => {
    const content = "import { Injectable } from '@nestjs/common';\nimport { BotService } from '@bot/bot.service';";

    expect(convert(content)).toEqual({ content, convertedCount: 0 });
  });
});
