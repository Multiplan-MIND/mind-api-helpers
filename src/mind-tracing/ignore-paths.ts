const DEFAULT_IGNORE_PATH = '/health/live';

/**
 * Builds the list of paths that must not be traced. The default `/health/live` is always present;
 * `raw` (a comma-separated list, usually MIND_TRACING_IGNORE_PATHS) only adds to it.
 */
export function parseIgnorePaths(raw?: string): string[] {
  const extras = (raw ?? '')
    .split(',')
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
  return [...new Set([DEFAULT_IGNORE_PATH, ...extras])];
}

/**
 * Returns a predicate for the http instrumentation `ignoreIncomingRequestHook`: true when the request
 * path (the url without its query string) exactly equals one of `paths`.
 */
export function ignoreIncomingRequest(paths: string[]): (req: { url?: string }) => boolean {
  return (req) => {
    if (!req.url) {
      return false;
    }
    const [path] = req.url.split('?');
    return paths.includes(path);
  };
}
