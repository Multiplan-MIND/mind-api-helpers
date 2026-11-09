import type { UserConfig } from '@commitlint/types';

/**
 * Estrutura de commit exigida: "tipo(escopo opcional): mensagem", o mesmo padrão já usado no
 * histórico deste repositório. @commitlint/config-conventional valida esse formato e a lista de
 * tipos, e trata o escopo como opcional.
 */
const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  /** Cada parágrafo do corpo é uma linha só, sem quebra manual; o limite de 100 caracteres do config-conventional rejeitaria isso. */
  rules: {
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore', 'build', 'ci', 'perf', 'revert', 'merge'],
    ],
  },
};

export default config;
