import type { Request, Response, NextFunction } from 'express';
import { admin } from '../lib/firebase';

/**
 * Express middleware that validates a Firebase Auth JWT from the
 * `Authorization: Bearer <token>` header.
 *
 * On success: attaches `{ uid }` to `req.user` and calls `next()`.
 * On failure: responds with 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
