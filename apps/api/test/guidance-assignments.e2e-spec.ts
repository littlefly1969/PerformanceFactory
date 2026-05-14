import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthenticatedGuard } from '../src/common/guards/authenticated.guard';

type InjectResponse = {
  statusCode: number;
  json: () => unknown;
};

type InjectFn = (options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: string;
}) => Promise<InjectResponse>;

type UserRecord = {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  password?: string;
};

type AreaRecord = {
  id: string;
  name: string;
};

type GuidanceRecord = {
  id: string;
  areaId: string;
  title: string;
  body: string;
  version: number;
  createdAt: Date;
};

type AssignmentRecord = {
  id: string;
  userId: string;
  contentId: string;
  status: string;
  createdAt: Date;
};

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string>;
      user?: unknown;
      raw?: { user?: unknown };
    }>();
    const userId = request.headers?.['x-test-user-id'];
    const role = request.headers?.['x-test-role'] as UserRole | undefined;

    if (!userId || !role) {
      return false;
    }

    const user = {
      id: userId,
      email: `${userId}@example.com`,
      role,
      createdAt: new Date(),
    };

    request.user = user;
    if (request.raw) {
      request.raw.user = user;
    }

    return true;
  }
}

const makePrismaMock = () => {
  const users: UserRecord[] = [
    {
      id: 'admin-1',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
      createdAt: new Date(),
    },
    {
      id: 'pro-1',
      email: 'pro@example.com',
      role: UserRole.PROFESSIONAL,
      createdAt: new Date(),
    },
    {
      id: 'user-1',
      email: 'user@example.com',
      role: UserRole.USER,
      createdAt: new Date(),
    },
    {
      id: 'user-2',
      email: 'other@example.com',
      role: UserRole.USER,
      createdAt: new Date(),
    },
  ];

  const areas: AreaRecord[] = [{ id: 'area-1', name: 'Footwork' }];

  const links = [
    { professionalId: 'pro-1', userId: 'user-1', areaId: 'area-1' },
  ];

  const guidance: GuidanceRecord[] = [];
  const assignments: AssignmentRecord[] = [];
  const consents: Array<{ id: string; userId: string; type: string }> = [];

  const nextId = (prefix: string, list: Array<{ id: string }>) =>
    `${prefix}-${list.length + 1}`;

  const findGuidance = (id: string) => guidance.find((g) => g.id === id);

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
    area: {
      findUnique: ({ where }: { where: { id: string } }) =>
        areas.find((area) => area.id === where.id) ?? null,
    },
    professionalUserLink: {
      findFirst: ({
        where,
      }: {
        where: { professionalId: string; userId: string; areaId?: string };
      }) => {
        return (
          links.find(
            (link) =>
              link.professionalId === where.professionalId &&
              link.userId === where.userId &&
              (!where.areaId || link.areaId === where.areaId),
          ) ?? null
        );
      },
    },
    guidanceContent: {
      create: ({
        data,
      }: {
        data: { areaId: string; title: string; body: string };
      }) => {
        const entry: GuidanceRecord = {
          id: nextId('guidance', guidance),
          areaId: data.areaId,
          title: data.title,
          body: data.body,
          version: 1,
          createdAt: new Date(),
        };
        guidance.push(entry);
        return entry;
      },
      findMany: ({ where }: { where?: { areaId?: string } }) => {
        const filtered = where?.areaId
          ? guidance.filter((item) => item.areaId === where.areaId)
          : guidance;
        return filtered.map((item) => ({
          ...item,
          area: areas.find((area) => area.id === item.areaId) ?? null,
        }));
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        findGuidance(where.id) ?? null,
    },
    userAssignment: {
      upsert: ({
        where,
        create,
      }: {
        where: { userId_contentId: { userId: string; contentId: string } };
        create: { userId: string; contentId: string };
      }) => {
        const found = assignments.find(
          (assignment) =>
            assignment.userId === where.userId_contentId.userId &&
            assignment.contentId === where.userId_contentId.contentId,
        );
        if (found) {
          return found;
        }
        const entry: AssignmentRecord = {
          id: nextId('assignment', assignments),
          userId: create.userId,
          contentId: create.contentId,
          status: 'ASSIGNED',
          createdAt: new Date(),
        };
        assignments.push(entry);
        return entry;
      },
      findMany: ({ where }: { where: { userId: string } }) => {
        return assignments
          .filter((assignment) => assignment.userId === where.userId)
          .map((assignment) => {
            const content = findGuidance(assignment.contentId);
            return {
              id: assignment.id,
              status: assignment.status,
              content: content
                ? {
                    id: content.id,
                    title: content.title,
                    body: content.body,
                    area:
                      areas.find((area) => area.id === content.areaId) ?? null,
                  }
                : null,
            };
          });
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        assignments.find((assignment) => assignment.id === where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string };
      }) => {
        const assignment = assignments.find((item) => item.id === where.id);
        if (!assignment) {
          return null;
        }
        assignment.status = data.status;
        return { id: assignment.id, status: assignment.status };
      },
    },
    consent: {
      findFirst: ({ where }: { where: { userId: string; type: string } }) =>
        consents.find(
          (consent) =>
            consent.userId === where.userId && consent.type === where.type,
        ) ?? null,
      create: ({ data }: { data: { userId: string; type: string } }) => {
        const entry = {
          id: nextId('consent', consents),
          userId: data.userId,
          type: data.type,
        };
        consents.push(entry);
        return entry;
      },
    },
  } as unknown as PrismaService;
};

describe('Guidance + Assignments (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;
  let contentId: string;
  let assignmentId: string;

  beforeAll(async () => {
    const prismaMock = makePrismaMock();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideGuard(AuthenticatedGuard)
      .useClass(TestAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();

    const fastify = app.getHttpAdapter().getInstance() as unknown as {
      inject: InjectFn;
    };
    inject = fastify.inject.bind(fastify);
  });

  afterAll(async () => {
    await app.close();
  });

  it('professional creates guidance', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/guidance',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
      payload: JSON.stringify({
        areaId: 'area-1',
        title: 'Footwork basics',
        body: 'Markdown...',
      }),
    });

    expect(response.statusCode).toBe(201);
    const data = response.json() as { id: string; title: string };
    expect(data.title).toBe('Footwork basics');
    contentId = data.id;
  });

  it('professional cannot assign to unrelated user (ABAC)', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/guidance/assign',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
      payload: JSON.stringify({
        userId: 'user-2',
        contentId,
      }),
    });

    expect(response.statusCode).toBe(403);
  });

  it('user sees only own assignments', async () => {
    const assignResponse = await inject({
      method: 'POST',
      url: '/api/guidance/assign',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
      payload: JSON.stringify({
        userId: 'user-1',
        contentId,
      }),
    });
    expect(assignResponse.statusCode).toBe(201);
    const assigned = assignResponse.json() as { id: string };
    assignmentId = assigned.id;

    const adminAssign = await inject({
      method: 'POST',
      url: '/api/guidance/assign',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'admin-1',
        'x-test-role': UserRole.ADMIN,
      },
      payload: JSON.stringify({
        userId: 'user-2',
        contentId,
      }),
    });
    expect(adminAssign.statusCode).toBe(201);

    const response = await inject({
      method: 'GET',
      url: '/api/assignments/my',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(200);
    const data = response.json() as Array<{ id: string }>;
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(assignmentId);
  });

  it('completion works', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/assignments/${assignmentId}/complete`,
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(201);
    const data = response.json() as { status: string };
    expect(data.status).toBe('COMPLETED');
  });

  it('responses never include password fields', async () => {
    const guidanceResponse = await inject({
      method: 'GET',
      url: '/api/guidance',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    const assignmentsResponse = await inject({
      method: 'GET',
      url: '/api/assignments/my',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(guidanceResponse.statusCode).toBe(200);
    expect(assignmentsResponse.statusCode).toBe(200);
    expect(JSON.stringify(guidanceResponse.json())).not.toContain('password');
    expect(JSON.stringify(assignmentsResponse.json())).not.toContain(
      'password',
    );
  });
});
