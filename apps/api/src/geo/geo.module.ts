import { Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { PlacesService } from './places.service';

/**
 * Google Places per l'indirizzo dell'atleta scelto fra i suggerimenti e per
 * le sedi dei circoli; Nominatim quando la chiave manca o Google non trova
 * la sede, e per gli indirizzi scritti a mano.
 */
@Module({
  providers: [GeocodingService, PlacesService],
  exports: [GeocodingService, PlacesService],
})
export class GeoModule {}
