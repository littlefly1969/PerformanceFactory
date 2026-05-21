import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import { AbacService } from '../src/common/policies/abac.service';
import {
  createCoachUserLinkDelegate,
  createPrismaTestFake,
  createProfessionalUserLinkDelegate,
} from './utils/prisma-test-fake';

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

  return createPrismaTestFake({
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
    professionalUserLink: createProfessionalUserLinkDelegate(links),
    coachUserLink: createCoachUserLinkDelegate(),
  });
};

describe('Auth + ABAC (service tests)', () => {
  let authService: AuthService;
  let abacService: AbacService;
  let moduleFixture: TestingModule;

  beforeAll(async () => {
    const prismaMock = await makePrismaMock();
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    authService = moduleFixture.get(AuthService);
    abacService = moduleFixture.get(AbacService);
  });

  afterAll(async () => {
    await moduleFixture.close();
  });

  it('validates user credentials', async () => {
    const user = await authService.validateUser(
      'pro@example.com',
      'password123',
    );
    expect(user.email).toBe('pro@example.com');
  });

  it('rejects invalid credentials', async () => {
    await expect(
      authService.validateUser('pro@example.com', 'wrong-password'),
    ).rejects.toThrow('Credenziali non valide');
  });

  it('destroys the session and logs out passport state', async () => {
    const logout = jest.fn((cb: (err?: unknown) => void) => cb());
    const destroy = jest.fn((cb: () => void) => cb());

    await expect(
      authService.logout({
        logout,
        session: { userId: 'pro-1', destroy },
      }),
    ).resolves.toEqual({ ok: true });

    expect(logout).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('clears fallback session identifiers when destroy is unavailable', async () => {
    const session = { userId: 'pro-1', passport: { user: 'pro-1' } };

    await expect(authService.logout({ session })).resolves.toEqual({
      ok: true,
    });

    expect(session.userId).toBeUndefined();
    expect(session.passport.user).toBeUndefined();
  });

  it('ABAC allows only linked users', async () => {
    const allowed = await abacService.canAccessUser('pro-1', 'user-1');
    const denied = await abacService.canAccessUser('pro-1', 'user-2');
    expect(allowed).toBe(true);
    expect(denied).toBe(false);
  });
});
