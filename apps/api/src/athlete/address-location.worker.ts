import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { AthleteAddressService } from './athlete-address';
import { PartnersService } from '../partners/partners.service';

/** Controllo giornaliero: il margine sul limite dei 30 giorni è di cinque. */
const INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Primo giro poco dopo l'avvio: una chiave appena messa vale subito. */
const FIRST_RUN_MS = 60 * 1000;

/** Rinnova le coordinate venute da Google Places: atleti e sedi dei circoli. */
@Injectable()
export class AddressLocationWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private first?: ReturnType<typeof setTimeout>;
  private running = false;
  private readonly logger = new Logger(AddressLocationWorker.name);
  constructor(
    private readonly address: AthleteAddressService,
    private readonly partners: PartnersService,
  ) {}

  onApplicationBootstrap() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.ADDRESS_LOCATION_WORKER === 'false'
    )
      return;
    this.first = setTimeout(() => void this.run(), FIRST_RUN_MS);
    this.first.unref();
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.first) clearTimeout(this.first);
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
      const clubs = await this.partners.refreshClubLocations();
      if (clubs.refreshed || clubs.cleared || clubs.moved)
        this.logger.log(
          `Circoli: ${clubs.refreshed} coordinate rinnovate, ${clubs.cleared} rimosse, ${clubs.moved} passate a Google`,
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
