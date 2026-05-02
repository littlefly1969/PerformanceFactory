import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import { AbacService } from '../src/common/policies/abac.service';

const makePrismaMock = async () => {
  const passwordHash = await bcrypt.hash('password123', 10);

  const users = [
    {
      id: 'pro-1',
      email: 'pro@example.com',
      password: passwordHash,
      role: UserRole.PROFESSIONAL,
      createdAt: new Date(),
    },
    {
      id: 'user-1',
      email: 'user@example.com',
      password: passwordHash,
      role: UserRole.USER,
      createdAt: new Date(),
    },
    {
      id: 'user-2',
      email: 'other@example.com',
      password: passwordHash,
      role: UserRole.USER,
      createdAt: new Date(),
    },
  ];

  const links = [
    {
      professionalId: 'pro-1',
      userId: 'user-1',
      areaId: 'area-1',
    },
  ];

  return {
    user: {
      findUnique: ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) {
          return users.find((u) => u.id === where.id) ?? null;
        }
        if (where.email) {
          return users.find((u) => u.email === where.email) ?? null;
        }
        return null;
      },
    },
    professionalUserLink: {
      findFirst: ({
        where,
      }: {
        where: { professionalId: string; userId: string; areaId?: string };
      }) => {
        return (
          links.find(
            (l) =>
              l.professionalId === where.professionalId &&
              l.userId === where.userId &&
              (!where.areaId || l.areaId === where.areaId),
          ) ?? null
        );
      },
    },
  } as unknown as PrismaService;
};

describe('Auth + ABAC (service tests)', () => {
  let authService: AuthService;
  let abacService: AbacService;

  beforeAll(async () => {
    const prismaMock = await makePrismaMock();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    authService = moduleFixture.get(AuthService);
    abacService = moduleFixture.get(AbacService);
  });

  it('validates user credentials', async () => {
    const user = await authService.validateUser(
      'pro@example.com',
      'password123',
    );
    expect(user.email).toBe('pro@example.com');
  });

  it('ABAC allows only linked users', async () => {
    const allowed = await abacService.canAccessUser('pro-1', 'user-1');
    const denied = await abacService.canAccessUser('pro-1', 'user-2');
    expect(allowed).toBe(true);
    expect(denied).toBe(false);
  });
});
