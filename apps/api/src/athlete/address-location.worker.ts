import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { AthleteAddressService } from './athlete-address';

/** Controllo giornaliero: il margine sul limite dei 30 giorni è di cinque. */
const INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Rinnova le coordinate degli indirizzi scelti con Google Places. */
@Injectable()
export class AddressLocationWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(AddressLocationWorker.name);
  constructor(private readonly address: AthleteAddressService) {}

  onApplicationBootstrap() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.ADDRESS_LOCATION_WORKER === 'false'
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
      const { refreshed, cleared } =
        await this.address.refreshProviderLocations();
      if (refreshed || cleared)
        this.logger.log(
          `Indirizzi: ${refreshed} coordinate rinnovate, ${cleared} rimosse`,
        );
    } catch (e) {
      this.logger.error(
        e instanceof Error ? e.message : 'Address location worker failed',
      );
    } finally {
      this.running = false;
    }
  }
}
