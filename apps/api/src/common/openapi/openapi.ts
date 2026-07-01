import { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerCustomOptions,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';
import {
  AccessTokenResponseDto,
  ApiErrorDto,
  HealthResponseDto,
} from './openapi.models';

const API_TAGS = [
  ['system', 'Stato del servizio e diagnostica pubblica.'],
  ['auth', 'Accesso locale, Google OIDC, sessione e token bearer.'],
  ['consents', 'Documenti, stato e accettazione dei consensi obbligatori.'],
  [
    'onboarding',
    'Profilazione iniziale, sport e definizione obiettivi atleta.',
  ],
  ['areas', 'Catalogo delle aree di performance.'],
  ['relationships', 'Relazioni tra atleti e professionisti.'],
  ['guidance', 'Contenuti professionali e relative assegnazioni.'],
  ['assignments', 'Attivita assegnate agli utenti e completamento.'],
  ['questions', 'Questionari, domande e flusso di revisione.'],
  ['answers', 'Invio delle risposte ai questionari.'],
  ['plans', 'Piani di miglioramento e flussi di approvazione.'],
  ['user', 'Vista atleta su questionari, piani e allenamenti.'],
  ['performance', 'Snapshot e storico del profilo prestazionale.'],
  ['professional-approvals', 'Coda e decisioni dei professionisti.'],
  ['cycles', 'Stato dei cicli di generazione.'],
  ['admin-cycles', 'Operazioni amministrative e orchestrazione AI.'],
  ['inspect', 'Ispezione e gestione amministrativa di utenti e competenze.'],
  ['ai-tuning', 'Prompt, audit, replay, golden context e valutazioni AI.'],
] as const;

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
] as const;

const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiErrorDto' },
    },
  },
});

export function buildOpenApiDocument(app: NestFastifyApplication) {
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'pf.sid';
  let builder = new DocumentBuilder()
    .setTitle('PerformanceFactory API')
    .setDescription(
      [
        'API HTTP del backend PerformanceFactory.',
        '',
        'Le operazioni protette accettano la sessione tramite cookie HTTP-only oppure un token bearer breve emesso da `GET /api/auth/token`.',
        'Gli endpoint di modifica richiedono inoltre che i consensi obbligatori siano aggiornati.',
      ].join('\n'),
    )
    .setVersion(process.env.API_VERSION ?? '0.1.0')
    .addServer('/', 'Server corrente')
    .addCookieAuth(
      cookieName,
      {
        type: 'apiKey',
        in: 'cookie',
        description: `Cookie di sessione HTTP-only (${cookieName}). Effettuare prima POST /api/auth/login.`,
      },
      'cookie',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token breve restituito da GET /api/auth/token.',
      },
      'bearer',
    );

  for (const [name, description] of API_TAGS) {
    builder = builder.addTag(name, description);
  }

  const documentOptions: SwaggerDocumentOptions = {
    extraModels: [ApiErrorDto, HealthResponseDto, AccessTokenResponseDto],
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  };

  return enrichOpenApiDocument(
    SwaggerModule.createDocument(app, builder.build(), documentOptions),
  );
}

export function enrichOpenApiDocument(document: OpenAPIObject) {
  document.components ??= {};
  document.components.responses = {
    ...document.components.responses,
    BadRequest: errorResponse(
      'Richiesta non valida. Il campo `message` contiene uno o piu dettagli di validazione.',
    ),
    Unauthorized: errorResponse(
      'Sessione o token assente, non valido oppure scaduto.',
    ),
    Forbidden: errorResponse(
      'Utente autenticato ma privo del ruolo, della relazione o dei consensi necessari.',
    ),
    NotFound: errorResponse('Risorsa non trovata.'),
    Conflict: errorResponse(
      'Operazione in conflitto con lo stato corrente della risorsa.',
    ),
    TooManyRequests: errorResponse(
      'Limite di richieste superato. Riprovare dopo la finestra indicata dal server.',
    ),
    InternalServerError: errorResponse('Errore interno non previsto.'),
  };

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation) continue;

      operation.responses ??= {};
      operation.responses['400'] ??= {
        $ref: '#/components/responses/BadRequest',
      };
      operation.responses['500'] ??= {
        $ref: '#/components/responses/InternalServerError',
      };

      if (operation.security?.length) {
        if (
          !operation.security.some((requirement) => 'bearer' in requirement)
        ) {
          operation.security.push({ bearer: [] });
        }
        operation.responses['403'] ??= {
          $ref: '#/components/responses/Forbidden',
        };
      }

      if (path.includes('{')) {
        operation.responses['404'] ??= {
          $ref: '#/components/responses/NotFound',
        };
      }

      if (
        path.endsWith('/auth/login') ||
        path.endsWith('/auth/register-athlete')
      ) {
        operation.responses['429'] ??= {
          $ref: '#/components/responses/TooManyRequests',
        };
      }
    }
  }

  return document;
}

export const swaggerUiOptions: SwaggerCustomOptions = {
  customSiteTitle: 'PerformanceFactory API | OpenAPI',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tagsSorter: 'alpha',
    operationsSorter: 'method',
    tryItOutEnabled: false,
    withCredentials: true,
  },
};

export function setupOpenApi(app: NestFastifyApplication) {
  const path = process.env.SWAGGER_PATH?.replace(/^\/+|\/+$/g, '') || 'docs';
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(path, app, document, swaggerUiOptions);
  return document;
}
