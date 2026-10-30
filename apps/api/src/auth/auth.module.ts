import { DiscoveryModule } from '../discovery/discovery.module';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleOidcService } from './google-oidc.service';
import { LocalStrategy } from './local.strategy';
import { PasskeyController } from './passkey.controller';
import { PasskeyService } from './passkey.service';
import { SessionSerializer } from './session.serializer';
import { ConsentsModule } from '../consents/consents.module';

@Module({
  imports: [
    DiscoveryModule,
    PassportModule.register({ session: false }),
    ConsentsModule,
  ],
  controllers: [AuthController, PasskeyController],
  providers: [
    AuthService,
    GoogleOidcService,
    LocalStrategy,
    PasskeyService,
    SessionSerializer,
  ],
})
export class AuthModule {}
