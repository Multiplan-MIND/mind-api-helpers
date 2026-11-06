/** Arquivos em que o comando procura comentários, a partir do diretório em que roda. */
export const SOURCE_FILES_PATTERN = '**/*.{ts,tsx,js,jsx}';

/** Código gerado, dependências, builds, documentação e configuração de ferramentas, que o comando não deve reescrever. */
export const IGNORED_PATHS = [
  '**/src/vite-env.d.ts',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.git/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/out/**',
  '**/public/**',
  '**/static/**',
  '**/.cache/**',
  '**/tmp/**',
  '**/temp/**',
  '**/.tmp/**',
  '**/.temp/**',
  '**/logs/**',
  '**/*.log',
  '**/storybook-static/**',
  '**/.storybook/**',
  '**/docs/**',
  '**/documentation/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/terraform/**',
  '**/cypress/**',
];

/**
 * Prefixos de diretiva de ferramenta (ESLint, TypeScript, Prettier, Istanbul, c8, V8, webpack). A ferramenta só reconhece
 * a diretiva logo após a abertura `//`, então convertê-la em bloco a desligaria sem aviso.
 */
export const DIRECTIVE_PREFIXES = [
  'eslint-',
  '@ts-',
  'prettier-ignore',
  'istanbul ignore',
  'c8 ignore',
  'v8 ignore',
  'webpack',
] as const;

/** Limites da prévia de linhas alteradas por arquivo, só para não inundar o terminal. */
export const PREVIEW = {
  MAX_CHANGES_TO_SHOW: 3,
  MAX_LINES_TO_ANALYZE: 100,
  TRUNCATE_LINE_LENGTH: 80,
} as const;

/** Linha que é inteiramente um comentário `//`, capturando a indentação e o texto. */
export const SINGLE_LINE_COMMENT_REGEX = /^([ \t]*)\/\/[ \t]?(.+)$/;

/** Linha com um `//` sem texto, usada como espaçador entre dois parágrafos de comentário. */
export const BLANK_COMMENT_REGEX = /^([ \t]*)\/\/[ \t]*$/;

/** Non-breaking space, en space, em space, thin space e hair space, tratados como espaço comum. */
export const SPACE_LIKE_CHAR_CODES = [0x00a0, 0x2002, 0x2003, 0x2009, 0x200a];

/** Line separator, paragraph separator, soft hyphen e BOM, removidos por não terem representação visível. */
export const REMOVABLE_CHAR_CODES = [0x2028, 0x2029, 0x00ad, 0xfeff];
