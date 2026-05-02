import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { RelationshipsService } from '../src/relationships/relationships.service';
import { UserRole } from '@prisma/client';

const createAuthController = () => {
  const prismaMock = {
    consent: {
      findFirst: () => Promise.resolve(null),
    },
  } as never;
  const authService = new AuthService(prismaMock);
  return new AuthController(authService);
};

describe('Response sanitization', () => {
  it('auth/me never returns password', async () => {
    const controller = createAuthController();
    const result = await controller.me({
      user: {
        id: 'u1',
        email: 'user@example.com',
        role: UserRole.USER,
        createdAt: new Date(),
        password: 'secret',
      },
    });

    expect(result).toMatchObject({
      email: 'user@example.com',
      aiConsent: false,
    });
    expect((result as { password?: string }).password).toBeUndefined();
  });

  it('relationships responses never include password', async () => {
    const prismaMock = {
      professionalUserLink: {
        findMany: () =>
          Promise.resolve([
            {
              userId: 'u1',
              user: {
                id: 'u1',
                email: 'user@example.com',
                role: UserRole.USER,
                createdAt: new Date(),
                password: 'secret',
              },
            },
          ]),
      },
    } as unknown as {
      professionalUserLink: {
        findMany: () => Promise<
          Array<{
            userId: string;
            user: {
              id: string;
              email: string;
              role: UserRole;
              createdAt: Date;
              password?: string;
            };
          }>
        >;
      };
    };

    const abacMock = {
      canAccessUser: () => Promise.resolve(true),
    } as unknown as {
      canAccessUser: (
        professionalId: string,
        userId: string,
      ) => Promise<boolean>;
    };

    const service = new RelationshipsService(
      prismaMock as never,
      abacMock as never,
    );
    const users = await service.getMyUsers('pro-1');

    expect(users).toHaveLength(1);
    expect((users[0] as { password?: string }).password).toBeUndefined();
  });
});
