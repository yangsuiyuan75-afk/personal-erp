import type { RequestWithId } from '../../common/middleware/request-id.middleware';

export interface AuthUser {
  id: string;
  username: string;
}

export type AuthenticatedRequest = RequestWithId & { user: AuthUser };
