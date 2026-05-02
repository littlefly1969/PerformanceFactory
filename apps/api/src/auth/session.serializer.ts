import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  serializeUser(
    user: { id: string },
    done: (err: unknown, id?: string) => void,
  ) {
    done(null, user.id);
  }

  async deserializeUser(
    id: string,
    done: (err: unknown, user?: unknown) => void,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    done(null, user ?? null);
  }
}
