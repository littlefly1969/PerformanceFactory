import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  InternalServerErrorException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Session } from 'express-session';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { AuthService } from './auth.service';
import { PasskeyService, PasskeySession } from './passkey.service';
import {
  PasskeyLoginDto,
  PasskeyRegistrationDto,
} from './dto/passkey-response.dto';

type StoredSession = Session & PasskeySession;
type PasskeyRequest = {
  session?: StoredSession;
  raw?: { session?: StoredSession };
  headers?: { 'user-agent'?: string };
};
type AuthedPasskeyRequest = PasskeyRequest & { user: { id: string } };

function sessionOf(req: PasskeyRequest) {
  const session = req.raw?.session ?? req.session;
  if (!session)
    throw new InternalServerErrorException('Sessione non disponibile');
  return session;
}

function callSession(
  session: StoredSession,
  method: 'save' | 'regenerate',
): Promise<void> {
  return new Promise((resolve, reject) =>
    session[method]((error?: unknown) =>
      error
        ? reject(
            error instanceof Error
              ? error
              : new Error('Salvataggio sessione fallito'),
          )
        : resolve(),
    ),
  );
}

/**
 * Accesso con passkey (Face ID, impronta): si attiva da utente già entrato e
 * poi sostituisce la password al login. Password e Google restano validi.
 */
@ApiTags('auth')
@Controller('auth/passkeys')
export class PasskeyController {
  constructor(
    private readonly passkeys: PasskeyService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Passkey registrate dall’utente corrente' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  list(@Req() req: AuthedPasskeyRequest) {
    return this.passkeys.list(req.user.id);
  }

  @Post('register/options')
  @HttpCode(200)
  @ApiOperation({ summary: 'Opzioni WebAuthn per creare una passkey' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  async registrationOptions(@Req() req: AuthedPasskeyRequest) {
    const session = sessionOf(req);
    const options = await this.passkeys.registrationOptions(
      req.user.id,
      session,
    );
    await callSession(session, 'save');
    return options;
  }

  @Post('register/verify')
  @ApiOperation({ summary: 'Salva la passkey creata dal dispositivo' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  async verifyRegistration(
    @Req() req: AuthedPasskeyRequest,
    @Body() body: PasskeyRegistrationDto,
  ) {
    const session = sessionOf(req);
    try {
      return await this.passkeys.verifyRegistration(
        req.user.id,
        session,
        body.response as unknown as RegistrationResponseJSON,
        req.headers?.['user-agent'],
      );
    } finally {
      await callSession(session, 'save');
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina una passkey dell’utente corrente' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  remove(@Req() req: AuthedPasskeyRequest, @Param('id') id: string) {
    return this.passkeys.remove(req.user.id, id);
  }

  @Post('login/options')
  @HttpCode(200)
  @ApiOperation({ summary: 'Opzioni WebAuthn per accedere con passkey' })
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ 'register-athlete': true })
  @Throttle({ 'public-events': { limit: 20, ttl: 60 * 1000 } })
  async authenticationOptions(@Req() req: PasskeyRequest) {
    const session = sessionOf(req);
    const options = await this.passkeys.authenticationOptions(session);
    await callSession(session, 'save');
    return options;
  }

  @Post('login/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Accedi con passkey e crea la sessione',
    description:
      'Verifica la firma del dispositivo e restituisce lo stesso profilo del login con password.',
  })
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ 'register-athlete': true })
  @Throttle({ 'public-events': { limit: 20, ttl: 60 * 1000 } })
  async verifyAuthentication(
    @Req() req: PasskeyRequest,
    @Body() body: PasskeyLoginDto,
  ) {
    const pending = sessionOf(req);
    let user: Awaited<ReturnType<PasskeyService['verifyAuthentication']>>;
    try {
      user = await this.passkeys.verifyAuthentication(
        pending,
        body.response as unknown as AuthenticationResponseJSON,
      );
    } catch (error) {
      // Il challenge è già consumato: lo store non deve più accettarlo.
      await callSession(pending, 'save');
      throw error;
    }
    // Sessione nuova dopo l'accesso: un cookie fissato prima non vale.
    await callSession(sessionOf(req), 'regenerate');
    const fresh = sessionOf(req);
    if (req.session) req.session = fresh;
    const result = await this.authService.createApplicationSession(req, user);
    await callSession(fresh, 'save');
    return result;
  }
}
