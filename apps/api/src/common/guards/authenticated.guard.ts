import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { verifyAccessToken } from '../auth-token';
import {
  REQUIRED_CONSENTS,
  consentDocumentHash,
} from '../../consents/consent-texts';

const safeUserSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
};

const consentExemptPaths = [
  '/api/auth/me',
  '/api/auth/token',
  '/api/auth/logout',
  '/api/consents/required',
  '/api/health',
];

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
      const userId = (request.user as { id?: string } | undefined)?.id;
      if (userId) {
        await this.assertRequiredConsents(request, userId);
      }
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
          await this.assertRequiredConsents(request, user.id);
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
        await this.assertRequiredConsents(request, user.id);
        return true;
      }
    }

    return false;
  }

  private async assertRequiredConsents(
    request: Request,
    userId: string,
  ) {
    const path = request.originalUrl?.split('?')[0] ?? request.url?.split('?')[0] ?? '';
    if (consentExemptPaths.some((item) => path === item || path.startsWith(`${item}/`))) {
      return;
    }
    const requiredTypes = REQUIRED_CONSENTS.map((consent) => consent.type);
    const consents = await this.prisma.consent.findMany({
      where: {
        userId,
        type: { in: requiredTypes },
        withdrawnAt: null,
      },
      select: { type: true, version: true, documentHash: true },
    });
    const accepted = new Map(consents.map((consent) => [consent.type, consent]));
    const missing = REQUIRED_CONSENTS.filter((document) => {
      const current = accepted.get(document.type);
      return (
        !current ||
        current.version !== document.version ||
        current.documentHash !== consentDocumentHash(document)
      );
    }).map((document) => document.type);
    if (missing.length) {
      throw new ForbiddenException({
        code: 'REQUIRED_CONSENTS_MISSING',
        message:
          'Devi accettare privacy e utilizzo dell assistente AI prima di usare la piattaforma',
        missingConsents: missing,
      });
    }
  }
}
