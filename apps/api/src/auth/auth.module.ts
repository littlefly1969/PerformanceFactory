import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleOidcService } from './google-oidc.service';
import { LocalStrategy } from './local.strategy';
import { SessionSerializer } from './session.serializer';
import { ConsentsModule } from '../consents/consents.module';

@Module({
  imports: [PassportModule.register({ session: false }), ConsentsModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleOidcService, LocalStrategy, SessionSerializer],
})
export class AuthModule {}
