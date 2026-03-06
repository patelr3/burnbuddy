import type { Request, Response, NextFunction } from 'express';

/**
 * Returns Express middleware that sets Cache-Control headers on responses.
 * Only applies to successful GET requests (2xx status codes).
 *
 * @param seconds - Max-age in seconds. Use 0 or negative for `no-store`.
 */
export function cacheControl(seconds: number) {
  const value = seconds > 0 ? `private, max-age=${seconds}` : 'no-store';

  return (_req: Request, res: Response, next: NextFunction): void => {
    res.set('Cache-Control', value);
    next();
  };
}
