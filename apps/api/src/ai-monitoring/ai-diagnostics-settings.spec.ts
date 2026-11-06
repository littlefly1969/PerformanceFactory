import { Logger } from '@nestjs/common';
import {
  AI_SETTINGS_READ_TIMEOUT_MS,
  AI_SETTINGS_REFRESH_MS,
  AI_SETTINGS_MAX_AGE_MS,
  AiDiagnosticsSettingsService,
} from './ai-diagnostics-settings.service';
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
  describe('bounded verification of cached ON state', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });
    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });
    it('expires ON synchronously even when a background poll has not run', async () => {
      const { service } = fixture();
      await service.update(true, 'admin-1');
      expect(service.snapshot()).toBe(true);
      jest.setSystemTime(Date.now() + AI_SETTINGS_MAX_AGE_MS);
      expect(service.snapshot()).toBe(false);
    });
    it('turns OFF after a stuck read, observes another instance disabling capture and ignores late ON', async () => {
      const { service, tx } = fixture();
      const remote = fixture();
      const on = {
        enabled: true,
        updatedAt: new Date(),
        updatedById: 'admin-1',
      };
      let stored = on;
      let release!: (value: typeof on) => void;
      tx.aiDiagnosticControl.findUnique.mockImplementation(() =>
        Promise.resolve(stored),
      );
      remote.tx.aiDiagnosticControl.findUnique.mockImplementation(() =>
        Promise.resolve(stored),
      );
      remote.tx.aiDiagnosticControl.upsert.mockImplementation(
        ({ update }: { update: { enabled: boolean } }) => {
          stored = {
            enabled: update.enabled,
            updatedAt: new Date(),
            updatedById: 'admin-2',
          };
          return Promise.resolve(stored);
        },
      );
      try {
        await service.onModuleInit();
        expect(service.snapshot()).toBe(true);
        tx.aiDiagnosticControl.findUnique.mockReturnValueOnce(
          new Promise<typeof on>((done) => {
            release = done;
          }),
        );
        await jest.advanceTimersByTimeAsync(AI_SETTINGS_REFRESH_MS);
        await remote.service.update(false, 'admin-2');
        expect(remote.service.snapshot()).toBe(false);
        await jest.advanceTimersByTimeAsync(AI_SETTINGS_READ_TIMEOUT_MS);
        expect(service.snapshot()).toBe(false);
        await jest.advanceTimersByTimeAsync(AI_SETTINGS_REFRESH_MS);
        expect(tx.aiDiagnosticControl.findUnique).toHaveBeenCalledTimes(3);
        expect(service.snapshot()).toBe(false);
        release(on);
        await jest.advanceTimersByTimeAsync(0);
        expect(service.snapshot()).toBe(false);
      } finally {
        service.onModuleDestroy();
        remote.service.onModuleDestroy();
      }
    });
    it('bounds physical pending reads and recovers once one of them settles', async () => {
      const { service, tx } = fixture();
      const on = {
        enabled: true,
        updatedAt: new Date(),
        updatedById: 'admin-1',
      };
      let release!: (value: typeof on) => void;
      tx.aiDiagnosticControl.findUnique
        .mockResolvedValueOnce(on)
        .mockReturnValueOnce(
          new Promise<typeof on>((done) => {
            release = done;
          }),
        )
        .mockReturnValueOnce(new Promise(() => {}))
        .mockResolvedValue({ ...on, enabled: false });
      try {
        await service.onModuleInit();
        await jest.advanceTimersByTimeAsync(30000);
        expect(service.snapshot()).toBe(false);
        expect(tx.aiDiagnosticControl.findUnique).toHaveBeenCalledTimes(3);
        release(on);
        await jest.advanceTimersByTimeAsync(AI_SETTINGS_REFRESH_MS);
        expect(tx.aiDiagnosticControl.findUnique).toHaveBeenCalledTimes(4);
        expect(service.snapshot()).toBe(false);
      } finally {
        service.onModuleDestroy();
      }
    });
    it('does not let a timed-out administrative read re-enable capture later', async () => {
      const { service, tx } = fixture();
      await service.update(true, 'admin-1');
      let release!: (value: {
        enabled: boolean;
        updatedAt: Date;
        updatedById: string;
      }) => void;
      tx.aiDiagnosticControl.findUnique.mockReturnValueOnce(
        new Promise((done) => {
          release = done;
        }),
      );
      const rejected = expect(service.read()).rejects.toThrow(
        'Impossibile verificare',
      );
      await jest.advanceTimersByTimeAsync(AI_SETTINGS_READ_TIMEOUT_MS);
      await rejected;
      expect(service.snapshot()).toBe(false);
      release({ enabled: true, updatedAt: new Date(), updatedById: 'admin-1' });
      await jest.advanceTimersByTimeAsync(0);
      expect(service.snapshot()).toBe(false);
    });
  });
});
