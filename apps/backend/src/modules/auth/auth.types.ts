/**
 * Auth Types — request.user ve service result tipleri.
 */

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
