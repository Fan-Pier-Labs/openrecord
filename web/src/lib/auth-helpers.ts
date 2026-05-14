import { NextRequest } from 'next/server';
import { withAuthApiRetry } from './auth';

interface SessionShape {
  user?: { id: string; name: string; email: string };
}

export async function requireAuth(request: NextRequest): Promise<{ id: string; name: string; email: string }> {
  const session = await withAuthApiRetry<SessionShape | null>((auth) =>
    auth.api.getSession({ headers: request.headers })
  );
  if (!session?.user) {
    throw new AuthError('Unauthorized', 401);
  }
  return session.user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
