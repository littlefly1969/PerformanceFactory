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
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { GoogleOidcService } from './google-oidc.service';
import { LocalAuthGuard } from '../common/guards/local-auth.guard';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { LoginRateLimitGuard } from '../common/guards/login-rate-limit.guard';
import { RegisterAthleteDto } from './dto/register-athlete.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
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
  @ApiOperation({ summary: 'Registra un nuovo atleta in attesa di attivazione admin' })
  @ApiBody({ type: RegisterAthleteDto })
  registerAthlete(@Body() body: RegisterAthleteDto) {
    return this.authService.registerAthlete(body);
  }

  @Get('google/login')
  @ApiOperation({ summary: 'Avvia login con Google OIDC' })
  @Redirect()
  googleLogin(
    @Req() req: unknown,
    @Query('returnTo') returnTo?: string,
  ) {
    return {
      url: this.google().buildAuthorizationUrl(
        req as Parameters<GoogleOidcService['buildAuthorizationUrl']>[0],
        'login',
        returnTo,
      ),
    };
  }

  @Get('google/register')
  @ApiOperation({ summary: 'Avvia registrazione atleta con Google OIDC' })
  @Redirect()
  googleRegister(
    @Req() req: unknown,
    @Query('returnTo') returnTo?: string,
  ) {
    return {
      url: this.google().buildAuthorizationUrl(
        req as Parameters<GoogleOidcService['buildAuthorizationUrl']>[0],
        'register',
        returnTo,
      ),
    };
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Callback Google OIDC server-side' })
  async googleCallback(
    @Req() req: unknown,
    @Res() reply: { redirect: (url: string) => unknown },
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    try {
      const result = await this.google().handleCallback(
        req as Parameters<GoogleOidcService['handleCallback']>[0],
        { code, state, error },
      );
      await this.authService.createApplicationSession(
        req as Parameters<AuthService['createApplicationSession']>[0],
        result.user,
      );
      return reply.redirect(this.google().successRedirect(result.returnTo));
    } catch (callbackError) {
      return reply.redirect(this.google().failureRedirect(callbackError));
    }
  }

  private google() {
    if (!this.googleOidc) {
      throw new Error('GoogleOidcService non configurato');
    }
    return this.googleOidc;
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
    const onboardingRequired = await this.authService.isOnboardingRequired(
      userId,
      role,
    );
    return { ...safe, aiConsent, onboardingRequired };
  }

  @Get('token')
  @ApiOperation({ summary: 'Emetti token bearer breve da sessione sicura attiva' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  token(@Req() req: { user?: unknown }) {
    return this.authService.issueAccessToken(req.user);
  }
}
