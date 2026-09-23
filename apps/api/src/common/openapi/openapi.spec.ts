import { Controller, Get, Param } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
  OpenAPIObject,
} from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { buildOpenApiDocument, enrichOpenApiDocument } from './openapi';

@ApiTags('system')
@Controller('openapi-test')
class OpenApiTestController {
  @Get(':id')
  @ApiOperation({ summary: 'Test operation' })
  @ApiParam({ name: 'id' })
  @ApiCookieAuth()
  get(@Param('id') id: string) {
    return { id };
  }
}

const baseDocument = (): OpenAPIObject => ({
  openapi: '3.0.0',
  info: { title: 'test', version: '1.0.0' },
  paths: {},
  components: { schemas: { ApiErrorDto: { type: 'object' } } },
});

describe('enrichOpenApiDocument', () => {
  it('adds reusable errors and authentication alternatives', () => {
    const document = baseDocument();
    document.paths['/api/items/{id}'] = {
      get: {
        operationId: 'Items_get',
        responses: { 200: { description: 'OK' } },
        security: [{ cookie: [] }],
      },
    };

    enrichOpenApiDocument(document);

    const operation = document.paths['/api/items/{id}']?.get;
    expect(document.components?.responses).toHaveProperty('BadRequest');
    expect(operation?.security).toEqual([{ cookie: [] }, { bearer: [] }]);
    expect(operation?.responses).toMatchObject({
      400: { $ref: '#/components/responses/BadRequest' },
      403: { $ref: '#/components/responses/Forbidden' },
      404: { $ref: '#/components/responses/NotFound' },
      500: { $ref: '#/components/responses/InternalServerError' },
    });
  });

  it('documents rate limiting only on the throttled auth operations', () => {
    const document = baseDocument();
    document.paths['/api/auth/login'] = {
      post: { responses: { 200: { description: 'OK' } } },
    };
    document.paths['/api/auth/me'] = {
      get: { responses: { 200: { description: 'OK' } } },
    };

    enrichOpenApiDocument(document);

    expect(document.paths['/api/auth/login']?.post?.responses).toHaveProperty(
      '429',
    );
    expect(document.paths['/api/auth/me']?.get?.responses).not.toHaveProperty(
      '429',
    );
  });

  it('preserves operation-specific response documentation', () => {
    const document = baseDocument();
    document.paths['/api/example'] = {
      post: {
        responses: {
          400: { description: 'Errore specifico del dominio' },
          201: { description: 'Created' },
        },
      },
    };

    enrichOpenApiDocument(document);

    expect(document.paths['/api/example']?.post?.responses?.['400']).toEqual({
      description: 'Errore specifico del dominio',
    });
  });
});

describe('buildOpenApiDocument', () => {
  it('uses the real global prefix and registers both security schemes', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OpenApiTestController],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');

    const document = buildOpenApiDocument(app);

    expect(document.paths).toHaveProperty('/api/openapi-test/{id}');
    expect(document.components?.securitySchemes).toMatchObject({
      cookie: { type: 'apiKey', in: 'cookie' },
      bearer: { type: 'http', scheme: 'bearer' },
    });
    expect(document.paths['/api/openapi-test/{id}']?.get?.operationId).toBe(
      'OpenApiTest_get',
    );

    await app.close();
  });

  it('documents every application operation with stable contract metadata', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');

    const document = buildOpenApiDocument(app);
    const operations = Object.entries(document.paths).flatMap(
      ([path, pathItem]) =>
        ['get', 'post', 'put', 'patch', 'delete'].flatMap((method) => {
          const operation = pathItem?.[method as keyof typeof pathItem];
          return operation &&
            typeof operation === 'object' &&
            'responses' in operation
            ? [{ path, method, operation }]
            : [];
        }),
    );
    const operationIds = operations.map(
      ({ operation }) => operation.operationId,
    );

    expect(operations).toHaveLength(142);
    expect(
      document.paths['/api/public/athlete-discovery']?.get?.security,
    ).toBeUndefined();
    expect(operations.every(({ path }) => path.startsWith('/api'))).toBe(true);
    expect(
      operations.every(({ operation }) => Boolean(operation.summary)),
    ).toBe(true);
    expect(new Set(operationIds).size).toBe(operationIds.length);

    for (const { path, operation } of operations) {
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map(
        (match) => match[1],
      );
      const documentedPathParameters = (operation.parameters ?? [])
        .filter(
          (parameter) =>
            'in' in parameter && parameter.in === 'path' && parameter.required,
        )
        .map((parameter) => ('name' in parameter ? parameter.name : undefined));
      expect(documentedPathParameters).toEqual(
        expect.arrayContaining(placeholders),
      );
    }

    await app.close();
  });
});
