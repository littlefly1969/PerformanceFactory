import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { verifyAccessToken } from '../auth-token';

const safeUserSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
};

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<
      Request & {
        isAuthenticated?: () => boolean;
        raw?: {
          isAuthenticated?: () => boolean;
          session?: { passport?: { user?: string }; userId?: string };
        };
        session?: { passport?: { user?: string }; userId?: string };
        user?: unknown;
      }
    >();

    const isAuth = request.isAuthenticated ?? request.raw?.isAuthenticated;
    if (isAuth && isAuth.call(request)) {
      return true;
    }

    const authorization = request.headers.authorization;
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : '';
    if (bearer) {
      const payload = verifyAccessToken(bearer);
      if (payload?.sub) {
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: safeUserSelect,
        });
        if (user) {
          request.user = user;
          return true;
        }
      }
    }

    const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(
      request.method?.toUpperCase?.() ?? 'GET',
    );
    if (unsafeMethod) {
      return false;
    }

    const sessionUserId =
      request.session?.userId ??
      request.raw?.session?.userId ??
      request.session?.passport?.user ??
      request.raw?.session?.passport?.user;

    if (sessionUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: sessionUserId },
        select: safeUserSelect,
      });
      if (user) {
        request.user = user;
        return true;
      }
    }

    return false;
  }
}
