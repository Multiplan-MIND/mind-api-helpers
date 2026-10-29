/**
 * As rotas de saúde são ignoradas pelo sufixo, porque os serviços as montam sob um prefixo que muda por ambiente
 * (`/concierge/health`, `/<projeto>/<branch>/health`), e um padrão exato perderia a maioria.
 */
const DEFAULT_IGNORED_SUFFIXES = ['/health', '/health/live'];

/**
 * Monta, a partir de `raw` (lista separada por vírgula, em geral TRACING_IGNORE_PATHS), os caminhos extras que não
 * geram trace. As rotas de saúde são sempre ignoradas, ver `ignoreIncomingRequest`.
 */
export function parseIgnorePaths(raw?: string): string[] {
  const extras = (raw ?? '')
    .split(',')
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
  return [...new Set(extras)];
}

/**
 * Devolve o predicado do `ignoreIncomingRequestHook` da instrumentação http: verdadeiro quando o caminho da requisição
 * (a url sem a query string) termina em `/health` ou `/health/live`, ou é igual a um dos `paths`.
 */
export function ignoreIncomingRequest(paths: string[]): (req: { url?: string }) => boolean {
  return (req) => {
    if (!req.url) {
      return false;
    }
    const [path] = req.url.split('?');
    return DEFAULT_IGNORED_SUFFIXES.some((suffix) => path.endsWith(suffix)) || paths.includes(path);
  };
}
