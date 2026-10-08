export interface MindRequestInfo {
  ip: string | null;
  userAgent: string | null;
  headers: {
    acceptLanguage: string | null;
    acceptEncoding: string | null;
    secChUa: string | null;
    secChUaPlatform: string | null;
    secChUaMobile: string | null;
    xForwardedFor: string | null;
  };
}

function headerValue(req: any, name: string): string | null {
  const raw = req?.headers?.[name];
  if (raw === undefined || raw === null) return null;
  const value = (Array.isArray(raw) ? raw.join(', ') : String(raw)).trim();
  return value.length ? value : null;
}

export function extractIp(req: any): string | null {
  const forwarded = headerValue(req, 'x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;
  return req?.ip ?? req?.socket?.remoteAddress ?? null;
}

export function extractRequestInfo(req: any): MindRequestInfo {
  return {
    ip: extractIp(req),
    userAgent: headerValue(req, 'user-agent'),
    headers: {
      acceptLanguage: headerValue(req, 'accept-language'),
      acceptEncoding: headerValue(req, 'accept-encoding'),
      secChUa: headerValue(req, 'sec-ch-ua'),
      secChUaPlatform: headerValue(req, 'sec-ch-ua-platform'),
      secChUaMobile: headerValue(req, 'sec-ch-ua-mobile'),
      xForwardedFor: headerValue(req, 'x-forwarded-for'),
    },
  };
}
