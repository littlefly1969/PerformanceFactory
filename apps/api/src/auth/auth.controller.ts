import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { GoogleOidcService } from './google-oidc.service';
import { LocalAuthGuard } from '../common/guards/local-auth.guard';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { LoginRateLimitGuard } from '../common/guards/login-rate-limit.guard';
import { RegisterAthleteDto } from './dto/register-athlete.dto';
import { ConsentAcceptanceDto } from '../consents/dto/consent-acceptance.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly googleOidc?: GoogleOidcService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Accesso con cookie sessione' })
  @UseGuards(LoginRateLimitGuard, LocalAuthGuard)
  async login(
    @Req()
    req: {
      user?: unknown;
      logIn: (user: unknown, cb: (err?: unknown) => void) => void;
    },
  ) {
    return this.authService.login(req);
  }

  @Post('register-athlete')
  @ApiOperation({
    summary: 'Registra un nuovo atleta in attesa di attivazione amministratore',
  })
  @ApiBody({ type: RegisterAthleteDto })
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'register-athlete': { limit: 3, ttl: 15 * 60 * 1000 } })
  registerAthlete(
    @Body() body: RegisterAthleteDto,
    @Req()
    req: { ip?: string; headers?: { 'user-agent'?: string } },
  ) {
    return this.authService.registerAthlete({
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Get('google/login')
  @ApiOperation({ summary: 'Avvia login con Google OIDC' })
  @Redirect()
  async googleLogin(@Req() req: unknown, @Query('returnTo') returnTo?: string) {
    const google = this.google();
    const typedReq = req as Parameters<
      GoogleOidcService['buildAuthorizationUrl']
    >[0];
    const url = google.buildAuthorizationUrl(typedReq, 'login', returnTo);
    await google.persistSession(typedReq);
    return {
      url,
    };
  }

  @Get('google/register')
  @ApiOperation({ summary: 'Avvia registrazione atleta con Google OIDC' })
  @Redirect()
  async googleRegister(
    @Req() req: unknown,
    @Query('returnTo') returnTo?: string,
  ) {
    const google = this.google();
    const typedReq = req as Parameters<
      GoogleOidcService['buildAuthorizationUrl']
    >[0];
    const url = google.buildAuthorizationUrl(typedReq, 'register', returnTo);
    await google.persistSession(typedReq);
    return {
      url,
    };
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Callback Google OIDC server-side' })
  async googleCallback(
    @Req() req: unknown,
    @Res()
    reply: {
      code?: (statusCode: number) => {
        header: (name: string, value: string) => { send: () => unknown };
      };
      redirect?: (url: string) => unknown;
    },
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    try {
      const result = await this.google().handleCallback(
        req as Parameters<GoogleOidcService['handleCallback']>[0],
        { code, state, error },
      );
      if ('pendingRegistration' in result) {
        this.logger.log(
          'Google OIDC pending registration created; saving session',
        );
        await this.google().persistSession(
          req as Parameters<GoogleOidcService['persistSession']>[0],
        );
        this.logger.log(
          'Google OIDC redirecting pending registration to consents',
        );
        return this.redirect(
          reply,
          this.google().successRedirect(result.returnTo),
        );
      }
      await this.authService.createApplicationSession(
        req as Parameters<AuthService['createApplicationSession']>[0],
        result.user,
      );
      await this.google().persistSession(
        req as Parameters<GoogleOidcService['persistSession']>[0],
      );
      this.logger.log('Google OIDC login session saved; redirecting user');
      return this.redirect(
        reply,
        this.google().successRedirect(result.returnTo),
      );
    } catch (callbackError) {
      this.logger.warn(
        `Google OIDC callback failed: ${this.errorMessage(callbackError)}`,
      );
      return this.redirect(reply, this.google().failureRedirect(callbackError));
    }
  }

  @Get('google/register/pending')
  @ApiOperation({ summary: 'Dati registrazione Google in attesa consensi' })
  googleRegisterPending(@Req() req: unknown) {
    return this.google().pendingRegistration(
      req as Parameters<GoogleOidcService['pendingRegistration']>[0],
    );
  }

  @Post('google/register/complete')
  @ApiOperation({ summary: 'Completa registrazione Google dopo consensi' })
  async completeGoogleRegister(
    @Req()
    req: {
      ip?: string;
      headers?: { 'user-agent'?: string };
    },
    @Body() body: ConsentAcceptanceDto,
  ) {
    const result = await this.google().completeRegistration(
      req as Parameters<GoogleOidcService['completeRegistration']>[0],
      body,
      {
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
    );
    await this.google().persistSession(
      req as Parameters<GoogleOidcService['persistSession']>[0],
    );
    return result;
  }

  private google() {
    if (!this.googleOidc) {
      throw new Error('GoogleOidcService non configurato');
    }
    return this.googleOidc;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Errore sconosciuto';
  }

  private redirect(
    reply: {
      code?: (statusCode: number) => {
        header: (name: string, value: string) => { send: () => unknown };
      };
      redirect?: (url: string) => unknown;
    },
    url: string,
  ) {
    if (reply.code) {
      return reply.code(302).header('Location', url).send();
    }
    return reply.redirect?.(url);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Esci e distruggi la sessione' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  async logout(@Req() req: { logout: (cb: (err?: unknown) => void) => void }) {
    return this.authService.logout(req);
  }

  @Get('me')
  @ApiOperation({ summary: 'Utente corrente' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  async me(@Req() req: { user?: unknown }) {
    if (!req.user) {
      return null;
    }
    const safe = this.authService.sanitizeUser(
      req.user as { password?: string },
    );
    const userId = (safe as { id?: string }).id ?? '';
    const role = (safe as { role?: string }).role;
    const aiConsent = await this.authService.hasAiConsent(userId);
    const consentStatus = await this.authService.requiredConsentStatus(userId);
    const onboardingRequired = await this.authService.isOnboardingRequired(
      userId,
      role,
    );
    return {
      ...safe,
      aiConsent,
      consentRequired: consentStatus.required,
      missingConsents: consentStatus.missingConsents,
      onboardingRequired,
    };
  }

  @Get('token')
  @ApiOperation({
    summary: 'Emetti token bearer breve da sessione sicura attiva',
  })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  token(@Req() req: { user?: unknown }) {
    return this.authService.issueAccessToken(req.user);
  }
}
