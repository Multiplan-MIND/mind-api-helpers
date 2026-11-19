/** Arquivos em que o comando converte os imports, a partir do diretório em que roda. */
export const SOURCE_FILES_PATTERN = 'src/**/*.ts';

/** Lido do diretório em que o comando roda; os `paths` dele definem os aliases. */
export const TSCONFIG_FILE_NAME = 'tsconfig.json';

/**
 * Caminho relativo depois de `from`, num `import` ou `export`, ou de um `import` só de efeito, com as aspas capturadas
 * para preservá-las.
 */
export const RELATIVE_IMPORT_REGEX = /(\bfrom\s+|\bimport\s+)(['"])(\.\.?\/[^'"\r\n]+)\2/g;
