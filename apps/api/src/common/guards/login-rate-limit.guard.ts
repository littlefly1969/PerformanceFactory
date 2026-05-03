import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      body?: { email?: string };
      raw?: { ip?: string };
    }>();

    const forwarded = request.headers?.['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ip = forwardedIp?.split(',')[0]?.trim() || request.ip || request.raw?.ip || 'unknown';
    const email = request.body?.email?.toLowerCase()?.trim() || 'unknown';
    const key = `${ip}:${email}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > MAX_ATTEMPTS) {
      throw new HttpException('Troppi tentativi di accesso', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
