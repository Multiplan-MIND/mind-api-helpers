import GraphQLJSON from 'graphql-type-json';

import { GraphqlAuthGatewayService } from './graphql-auth-gateway.service';
import { getMindFederationConfig } from './graphql-federation.config';
import {
  createLoggerMock,
  EMPTY_IDENTITY,
  federationLinkOf,
  LoggerMock,
  NEST_10_FEDERATION_LINK,
  resolveContext,
} from './graphql-auth.spec-helper';
import { createRedisMock } from './jwt.test-support';

// Stubs the scalar instead of installing `graphql`; see graphql-auth.spec-helper.ts for the reason
jest.mock('graphql-type-json', () => ({ __esModule: true, default: { name: 'JSON' } }));

describe('GraphqlAuthGatewayService', () => {
  let logger: LoggerMock;
  let service: GraphqlAuthGatewayService;

  beforeEach(() => {
    logger = createLoggerMock();
    service = new GraphqlAuthGatewayService(logger as any, createRedisMock() as any);
  });

  describe('createGqlOptions', () => {
    it('should build the federation 2 options on the default path', async () => {
      const options = await service.createGqlOptions();

      expect(options).toMatchObject({
        autoSchemaFile: { path: 'schema.gql', federation: getMindFederationConfig() },
        sortSchema: true,
        playground: false,
        resolvers: { JSON: GraphQLJSON },
        resolverValidationOptions: { requireResolversToMatchSchema: 'warn' },
      });
      expect(options.path).toBeUndefined();
      expect(options.plugins).toHaveLength(1);
      expect(options.context).toEqual(expect.any(Function));
    });

    it('should declare the NestJS 10 federation link (v2.3, 11 directives) in the generated subgraph SDL', async () => {
      const options = await service.createGqlOptions();

      expect(federationLinkOf(options)).toBe(NEST_10_FEDERATION_LINK);
    });
  });

  describe('context', () => {
    const identityHeaders = {
      'mind-user-id': 'u1',
      'mind-user-roles': 'admin,user-viewer',
      'mind-session-expires-in': '2030-01-01T00:00:00.000Z',
    };

    it('should return an empty identity when the gateway headers are absent', async () => {
      await expect(resolveContext(service, {})).resolves.toEqual(EMPTY_IDENTITY);
    });

    it('should trust the identity injected by the gateway, including the session id', async () => {
      await expect(resolveContext(service, { ...identityHeaders, 'mind-session-id': 'sess-1' })).resolves.toMatchObject(
        {
          mindUserId: 'u1',
          mindUserRoles: ['admin', 'user-viewer'],
          mindSessionExpiresIn: new Date('2030-01-01T00:00:00.000Z'),
          mindSessionId: 'sess-1',
        },
      );
    });

    it('should keep the user id and default the roles to empty when the roles header is missing', async () => {
      await expect(resolveContext(service, { 'mind-user-id': 'u1' })).resolves.toMatchObject({
        mindUserId: 'u1',
        mindUserRoles: [],
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should normalize mind-session-id like the other headers', async () => {
      const withSid = (value: string) => resolveContext(service, { ...identityHeaders, 'mind-session-id': value });

      await expect(withSid('  sess-1 ')).resolves.toMatchObject({ mindSessionId: 'sess-1' });
      await expect(withSid('')).resolves.toMatchObject({ mindSessionId: null });
      await expect(resolveContext(service, identityHeaders)).resolves.toMatchObject({ mindSessionId: null });
    });

    it('should read the client ip from mind-request-ip, ignoring X-Forwarded-For and req.ip (the router address)', async () => {
      const ctx = await resolveContext(
        service,
        { 'mind-request-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'jest' },
        { ip: '10.0.0.9' },
      );

      expect(ctx).toMatchObject({ mindRequestInfo: { ip: '203.0.113.7', userAgent: 'jest' } });
      await expect(
        resolveContext(service, { 'x-forwarded-for': '1.2.3.4' }, { ip: '10.0.0.9' }),
      ).resolves.toMatchObject({
        mindRequestInfo: { ip: null },
      });
    });
  });
});
