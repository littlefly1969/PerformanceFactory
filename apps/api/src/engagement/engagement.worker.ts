import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { EngagementService } from './engagement.service';

/** Controllo orario: la soglia è di giorni, un'ora di ritardo è irrilevante. */
const INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class EngagementWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(EngagementWorker.name);
  constructor(private readonly engagement: EngagementService) {}

  onApplicationBootstrap() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.ENGAGEMENT_WORKER === 'false'
    )
      return;
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const moved = await this.engagement.classify();
      if (moved.sleepy || moved.dormant)
        this.logger.log(
          `Engagement: ${moved.sleepy} sonnolenti, ${moved.dormant} dormienti`,
        );
    } catch (e) {
      this.logger.error(
        e instanceof Error ? e.message : 'Engagement worker failed',
      );
    } finally {
      this.running = false;
    }
  }
}
