/**
 * Health routes are ignored by suffix because services mount them under a prefix that changes per environment
 * (`/concierge/health`, `/<project>/<branch>/health`), so an exact default would miss most of them.
 */
const DEFAULT_IGNORED_SUFFIXES = ['/health', '/health/live'];

/**
 * Builds the list of extra paths that must not be traced from `raw` (a comma-separated list, usually
 * TRACING_IGNORE_PATHS). The health routes are always ignored, see `ignoreIncomingRequest`.
 */
export function parseIgnorePaths(raw?: string): string[] {
  const extras = (raw ?? '')
    .split(',')
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
  return [...new Set(extras)];
}

/**
 * Returns a predicate for the http instrumentation `ignoreIncomingRequestHook`: true when the request path (the url
 * without its query string) ends with `/health` or `/health/live`, or exactly equals one of `paths`.
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
