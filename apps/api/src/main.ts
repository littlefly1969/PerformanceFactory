import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import middie from '@fastify/middie';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { randomBytes } from 'crypto';

function warnIfAiPromptLogEnabled(isProduction: boolean) {
  if (process.env.AI_DEBUG_PROMPT_LOG !== 'true') {
    return;
  }
  const logger = new Logger('AiDebugPromptLog');
  const banner = '='.repeat(72);
  logger.warn(banner);
  logger.warn('ATTENZIONE: AI_DEBUG_PROMPT_LOG=true');
  logger.warn('I prompt AI vengono scritti nei log applicativi.');
  logger.warn(
    'Il payload non include identificativi diretti (nome, email, userId)',
  );
  logger.warn('ma contiene dati personali pseudonimizzati dell atleta:');
  logger.warn('  - obiettivo prestazione (testo libero)');
  logger.warn('  - anamnesi generale (eta, peso, sport, condizioni di salute)');
  logger.warn('  - anamnesi area, note e rifiuti dei cicli precedenti');
  logger.warn(
    'La combinazione e sufficiente a re-identificare in piccoli set.',
  );
  logger.warn(
    'Impostare AI_DEBUG_PROMPT_LOG=false prima di esporre il servizio.',
  );
  if (isProduction) {
    logger.warn(
      '!!! NODE_ENV=production: rischio privacy ATTIVO in questo momento !!!',
    );
  }
  logger.warn(banner);
}

type RedisStoreCtor = new (options: {
  client: unknown;
  prefix?: string;
}) => session.Store;

function getCsvEnv(name: string, fallback: string) {
  const value = process.env[name] ?? fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function buildSessionStore() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL e obbligatorio in produzione');
    }
    return undefined;
  }

  try {
    const dynamicRequire = eval('require') as NodeRequire;
    const redisModule = dynamicRequire('redis') as {
      createClient: (options: { url: string }) => {
        connect: () => Promise<void>;
        on: (event: string, listener: (error: unknown) => void) => void;
      };
    };
    const connectRedisModule = dynamicRequire('connect-redis') as {
      RedisStore?: RedisStoreCtor;
      default?: RedisStoreCtor;
    };
    const RedisStore =
      connectRedisModule.RedisStore ?? connectRedisModule.default;
    if (!RedisStore) {
      throw new Error('Export RedisStore non trovato');
    }

    const client = redisModule.createClient({ url: redisUrl });
    client.on('error', (error) => {
      console.error('[redis] session client error', error);
    });
    await client.connect();

    return new RedisStore({
      client,
      prefix: process.env.REDIS_SESSION_PREFIX ?? 'pf:sess:',
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    console.warn('[session] Redis unavailable, using memory store', error);
    return undefined;
  }
}

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  warnIfAiPromptLogEnabled(isProduction);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: isProduction }),
  );

  const fastify = app.getHttpAdapter().getInstance();
  if (!fastify.hasDecorator('use')) {
    await app.register(middie);
  }

  app.enableCors({
    origin: getCsvEnv('WEB_ORIGIN', 'http://127.0.0.1:3000'),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.use(cookieParser());
  app.use(
    (
      req: unknown,
      res: { setHeader?: (name: string, value: string) => void },
      next: () => void,
    ) => {
      res.setHeader?.('X-Content-Type-Options', 'nosniff');
      res.setHeader?.('X-Frame-Options', 'DENY');
      res.setHeader?.('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader?.(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()',
      );
      if (isProduction) {
        res.setHeader?.(
          'Strict-Transport-Security',
          'max-age=31536000; includeSubDomains',
        );
      }
      void req;
      next();
    },
  );

  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && !sessionSecret) {
    throw new Error('SESSION_SECRET e obbligatorio in produzione');
  }

  const sessionStore = await buildSessionStore();
  const devSessionSecret =
    process.env.NODE_ENV === 'test'
      ? 'test-session-secret'
      : randomBytes(32).toString('hex');

  app.use(
    session({
      store: sessionStore,
      name: process.env.SESSION_COOKIE_NAME ?? 'pf.sid',
      secret: sessionSecret ?? devSessionSecret,
      resave: false,
      saveUninitialized: false,
      proxy: isProduction,
      cookie: {
        httpOnly: true,
        secure: process.env.SESSION_COOKIE_SECURE
          ? process.env.SESSION_COOKIE_SECURE === 'true'
          : isProduction,
        sameSite: (process.env.SESSION_COOKIE_SAME_SITE ?? 'lax') as
          | boolean
          | 'lax'
          | 'strict'
          | 'none',
        domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
        maxAge: Number(process.env.SESSION_MAX_AGE_MS ?? 1000 * 60 * 60 * 8),
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );

  if (process.env.SWAGGER_ENABLED !== 'false') {
    const config = new DocumentBuilder()
      .setTitle('PerformanceFactory API')
      .setVersion('0.1')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  app.setGlobalPrefix('api');

  await app.listen(
    Number(process.env.API_PORT ?? 4000),
    process.env.API_HOST ?? '127.0.0.1',
  );
}

void bootstrap();
