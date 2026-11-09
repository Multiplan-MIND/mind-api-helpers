import type { Configuration } from 'lint-staged';

/**
 * As tarefas em função não recebem a lista de arquivos do commit e rodam sobre o projeto inteiro, como no concierge.
 * O build vem primeiro porque o `fix-comments` roda pelo `dist/` desta biblioteca, e assim usa o código que está
 * sendo commitado; ele também faz as vezes de checagem de tipos. O `convert-relative-imports` fica de fora: a
 * biblioteca não declara aliases no `tsconfig.json` e usa imports relativos.
 */
const config: Configuration = {
  '*.{js,ts,mts}': [
    () => 'yarn build',
    () => 'yarn fix-comments',
    () => 'yarn lint-autofix --max-warnings=0',
    () => 'yarn format',
    () => 'git add -u',
  ],
  '*.{json,md,yml,yaml}': 'prettier --write',
};

export default config;
