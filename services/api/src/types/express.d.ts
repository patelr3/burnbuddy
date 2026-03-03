// Augment the Express Request interface to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: { uid: string };
    }
  }
}

export {};
