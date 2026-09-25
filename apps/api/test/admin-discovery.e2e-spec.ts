import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthenticatedGuard } from '../src/common/guards/authenticated.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyValidationPipe } from './utils/apply-validation-pipe';
import {
  discoveryFixture,
  discoveryTemplatesPrisma,
} from './utils/discovery-templates-fake';

type InjectFn = (options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: string;
}) => Promise<{ statusCode: number; json: () => unknown }>;

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string>;
      user?: unknown;
      raw?: { user?: unknown };
    }>();
    const role = request.headers?.['x-test-role'];
    if (!role) return false;
    request.user = { id: 'admin-1', role };
    if (request.raw) request.raw.user = request.user;
    return true;
  }
}

describe('Admin discovery manager (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;
  const store = discoveryTemplatesPrisma(discoveryFixture());
  const call = (
    method: string,
    url: string,
    body?: unknown,
    role: UserRole = UserRole.ADMIN,
  ) =>
    inject({
      method,
      url: `/api/admin/onboarding-templates${url}`,
      headers: {
        'x-test-role': role,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      payload: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(store.prisma)
      .overrideGuard(AuthenticatedGuard)
      .useClass(TestAuthGuard)
      .compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    applyValidationPipe(app);
    await app.init();
    const fastify = app.getHttpAdapter().getInstance() as unknown as {
      inject: InjectFn;
    };
    inject = fastify.inject.bind(fastify);
  });
  beforeEach(() => {
    delete process.env.PF4_SPORT_MODE;
    store.reset(discoveryFixture());
  });
  afterAll(async () => {
    await app.close();
  });

  it('e riservato agli amministratori e al solo scope DISCOVERY', async () => {
    expect(
      (await call('GET', '?scope=DISCOVERY', undefined, UserRole.AI_TUNER))
        .statusCode,
    ).toBe(403);
    expect((await call('GET', '?scope=AREA')).statusCode).toBe(400);
  });

  it('elenca le domande con i conteggi derivati', async () => {
    const response = await call('GET', '?scope=DISCOVERY');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sportMode: 'fixed',
      stats: {
        configured: 6,
        active: 5,
        conditional: 1,
        unconditional: 3,
        activePathCount: 4,
      },
    });
  });

  it('riordina in modo atomico e rifiuta un ordine che rompe un ramo', async () => {
    const broken = await call('POST', '/reorder', {
      ids: ['sport', 'goal', 'injury_detail', 'injury', 'weight', 'archived'],
    });
    expect(broken.statusCode).toBe(400);
    expect((broken.json() as { message: string }).message).toMatch(
      /deve dipendere/,
    );
    expect(store.rows().find((r) => r.id === 'injury')!.orderIndex).toBe(20);

    const ids = [
      'goal',
      'sport',
      'weight',
      'injury',
      'injury_detail',
      'archived',
    ];
    const response = await call('POST', '/reorder', { ids });
    expect(response.statusCode).toBe(201);
    const { templates } = response.json() as { templates: { id: string }[] };
    expect(templates.map((t) => t.id)).toEqual(ids);
    expect((await call('POST', '/reorder', { ids: 'goal' })).statusCode).toBe(
      400,
    );
  });

  it('crea, modifica ed elimina domande rispettando i riferimenti', async () => {
    const created = await call('POST', '', {
      key: 'height',
      label: 'Quanto sei alto?',
      inputType: 'NUMBER',
      optionsJson: {
        type: 'number',
        contextKey: 'general_height_cm',
        min: 120,
        max: 230,
        step: 1,
        ui: { unit: 'cm' },
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ key: 'height', orderIndex: 60 });

    const deactivated = await call('PATCH', '/weight', { isActive: false });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json()).toMatchObject({ isActive: false });
    // Il codice e stabile: la modifica non accetta campi fuori contratto.
    expect((await call('PATCH', '/weight', { key: 'other' })).statusCode).toBe(
      400,
    );

    const referenced = await call('DELETE', '/injury');
    expect(referenced.statusCode).toBe(400);
    expect((referenced.json() as { message: string }).message).toMatch(
      /Impossibile eliminare/,
    );
    expect((await call('DELETE', '/injury_detail')).statusCode).toBe(200);
  });

  it('protegge le rotte assessment e ne valida il contratto', async () => {
    const assessment = (
      method: string,
      url: string,
      body?: unknown,
      role: UserRole = UserRole.ADMIN,
    ) =>
      inject({
        method,
        url: `/api/admin/assessment-templates${url}`,
        headers: {
          'x-test-role': role,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        payload: body === undefined ? undefined : JSON.stringify(body),
      });
    expect(
      (await assessment('GET', '', undefined, UserRole.AI_TUNER)).statusCode,
    ).toBe(403);
    // Il driver di appartenenza non si cambia in modifica.
    expect(
      (await assessment('PATCH', '/q1', { areaId: 'other' })).statusCode,
    ).toBe(400);
    expect(
      (
        await assessment('POST', '', {
          areaId: 'area',
          label: 'Domanda',
          options: [
            { value: 'a', label: 'A', score: 150 },
            { value: 'b', label: 'B', score: 0 },
          ],
        })
      ).statusCode,
    ).toBe(400);
  });
});
