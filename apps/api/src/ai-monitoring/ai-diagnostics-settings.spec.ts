import { AiDiagnosticsSettingsService } from './ai-diagnostics-settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('admin diagnostic switch', () => {
  function fixture() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      aiDiagnosticControl: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          enabled: true,
          updatedAt: new Date('2026-11-06T01:00:00Z'),
          updatedById: 'admin-1',
        }),
      },
      aiDiagnosticControlChange: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const db = {
      ...tx,
      $transaction: jest.fn((action: (value: typeof tx) => unknown) =>
        action(tx),
      ),
    };
    return {
      db,
      tx,
      service: new AiDiagnosticsSettingsService(db as unknown as PrismaService),
    };
  }
  it('is disabled by default and persists a switch with the acting administrator', async () => {
    const { service, tx } = fixture();
    expect(service.snapshot()).toBe(false);
    await service.update(true, 'admin-1');
    expect(service.snapshot()).toBe(true);
    expect(tx.aiDiagnosticControlChange.create).toHaveBeenCalledWith({
      data: { enabled: true, actorId: 'admin-1' },
    });
  });
  it('does not allow an old concurrent read to overwrite a completed admin change', async () => {
    const { service, tx } = fixture();
    let resolve!: (value: null) => void;
    tx.aiDiagnosticControl.findUnique.mockReturnValueOnce(
      new Promise<null>((done) => {
        resolve = done;
      }),
    );
    const read = service.read();
    await service.update(true, 'admin-1');
    resolve(null);
    await read;
    expect(service.snapshot()).toBe(true);
  });
  it('bounds startup when settings persistence is stuck and keeps AI request snapshots synchronous', async () => {
    jest.useFakeTimers();
    const { service, tx } = fixture();
    tx.aiDiagnosticControl.findUnique.mockReturnValue(new Promise(() => {}));
    try {
      const starting = service.onModuleInit();
      await jest.advanceTimersByTimeAsync(500);
      await starting;
      expect(service.snapshot()).toBe(false);
    } finally {
      service.onModuleDestroy();
      jest.useRealTimers();
    }
  });
});
