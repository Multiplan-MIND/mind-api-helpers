import { isIP } from 'net';

import { isNullOrUndefined } from '../mind-helpers/validation.helper';

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

export function headerValue(req: any, name: string): string | null {
  const raw = req?.headers?.[name];
  if (isNullOrUndefined(raw)) return null;
  const value = (Array.isArray(raw) ? raw.join(', ') : String(raw)).trim();
  return value.length ? value : null;
}

function validIp(value: unknown): string | null {
  return typeof value === 'string' && isIP(value) ? value : null;
}

// `req.ip` is computed by Express from the `trust proxy` setting, so the service must configure it with
// the number of proxies in front (e.g. `app.set('trust proxy', 1)`). X-Forwarded-For is never read
// here: its first item is whatever the client sent.
export function extractIp(req: any): string | null {
  return validIp(req?.ip ?? req?.socket?.remoteAddress);
}

export function extractRequestInfo(req: any, options: { ipHeader?: string } = {}): MindRequestInfo {
  const ip = options.ipHeader ? validIp(headerValue(req, options.ipHeader)) : extractIp(req);
  return {
    ip,
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
