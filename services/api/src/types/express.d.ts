import type { UserProfile } from '@burnbuddy/shared';

// Augment the Express Request interface to carry the authenticated user and profile
declare global {
  namespace Express {
    interface Request {
      user?: { uid: string };
      profile?: UserProfile;
    }
  }
}

export {};
