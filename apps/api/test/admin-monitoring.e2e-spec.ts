import { AiDiagnosticsSettingsService } from '../src/ai-monitoring/ai-diagnostics-settings.service';
import { AiMonitoringService } from '../src/ai-monitoring/ai-monitoring.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AnalyticsController } from '../src/analytics/analytics.controller';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { RegistrationReportService } from '../src/analytics/registration-report.service';
import { AiLogsController } from '../src/ai-monitoring/ai-logs.controller';
import { AiLogsService } from '../src/ai-monitoring/ai-logs.service';
import { AuthenticatedGuard } from '../src/common/guards/authenticated.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyValidationPipe } from './utils/apply-validation-pipe';

class TestAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const role = req.headers['x-role'];
    if (!role) return false;
    req.user = { role, id: 'admin-test' };
    return true;
  }
}
describe('admin reporting access and validation', () => {
  let app: NestFastifyApplication;
  const logs = {
    list: jest.fn().mockResolvedValue({ rows: [] }),
    detail: jest.fn().mockResolvedValue({ attempts: [] }),
  };
  const controls = {
    read: jest.fn().mockResolvedValue({ enabled: false, changes: [] }),
    update: jest.fn().mockResolvedValue({ enabled: true }),
  };
  const registrations = { report: jest.fn().mockResolvedValue({ daily: [] }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AiLogsController, AnalyticsController],
      providers: [
        RolesGuard,
        { provide: AiDiagnosticsSettingsService, useValue: controls },
        {
          provide: AiMonitoringService,
          useValue: { health: () => ({ pendingWrites: 0 }) },
        },
        { provide: PrismaService, useValue: {} },
        { provide: AiLogsService, useValue: logs },
        { provide: RegistrationReportService, useValue: registrations },
        { provide: AnalyticsService, useValue: {} },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthenticatedGuard)
      .useClass(TestAuth)
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    applyValidationPipe(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());
  const paths = [
    '/admin/analytics/registrations',
    '/admin/ai-logs',
    '/admin/ai-logs/configuration',
    '/admin/ai-logs/11111111-1111-4111-8111-111111111111',
  ];
  it.each(paths)(
    'protects %s from anonymous visitors, athletes, coaches and AI tuners',
    async (url) => {
      for (const role of ['', 'USER', 'PROFESSIONAL', 'AI_TUNER']) {
        const res = await app.inject({
          method: 'GET',
          url,
          headers: role ? { 'x-role': role } : {},
        });
        expect(res.statusCode).toBe(403);
      }
      expect(
        (
          await app.inject({
            method: 'GET',
            url,
            headers: { 'x-role': 'ADMIN' },
          })
        ).statusCode,
      ).toBe(200);
    },
  );
  it.each([
    'days=31',
    'days=no',
    'page=0',
    'pageSize=500',
    'operation=anything',
    'provider=other',
    'status=UNKNOWN',
    'id=bad',
  ])('rejects invalid log query %s', async (query) => {
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/admin/ai-logs?${query}`,
          headers: { 'x-role': 'ADMIN' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('applies defaults and parses pagination as integers', async () => {
    await app.inject({
      method: 'GET',
      url: '/admin/ai-logs?page=2&provider=gemini',
      headers: { 'x-role': 'ADMIN' },
    });
    expect(logs.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        days: 7,
        page: 2,
        pageSize: 25,
        provider: 'gemini',
      }),
    );
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/admin/analytics/registrations?days=91',
          headers: { 'x-role': 'ADMIN' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('allows only ADMIN to change capture and rejects malformed settings', async () => {
    for (const role of ['', 'USER', 'PROFESSIONAL', 'AI_TUNER']) {
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/admin/ai-logs/configuration',
            headers: role ? { 'x-role': role } : {},
            payload: { enabled: true },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/admin/ai-logs/configuration',
          headers: { 'x-role': 'ADMIN' },
          payload: { enabled: 'true' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/admin/ai-logs/configuration',
          headers: { 'x-role': 'ADMIN' },
          payload: { enabled: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(controls.update).toHaveBeenLastCalledWith(true, 'admin-test');
  });
});
