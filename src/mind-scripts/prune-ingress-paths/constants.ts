/**
 * O nome de um Service precisa ser um rótulo DNS-1035: minúsculas, dígitos e hífen, começando por letra, terminando por
 * letra ou dígito e com no máximo 63 caracteres.
 */
export const SERVICE_NAME_MAXIMUM_LENGTH = 63;
export const SERVICE_NAME_PATTERN = /^[a-z]([-a-z0-9]*[a-z0-9])?$/;

export const INGRESS_FILE_EXTENSIONS = new Set(['.yml', '.yaml']);

export const USAGE = 'Usage: mind-prune-ingress-paths <ingress.yml>';

export const SEPARATOR = '══════════════════════════════════════════';
