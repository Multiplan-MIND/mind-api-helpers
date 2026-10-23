// `graphql` is a peer of graphql-type-json and is not installed in this package.
jest.mock('graphql-type-json', () => ({ __esModule: true, default: {} }));

import { GraphqlAuthGatewayService } from './graphql-auth-gateway.service';
import { createLoggerMock, createRedisMock } from './jwt.test-support';

describe('GraphqlAuthGatewayService', () => {
  let logger: ReturnType<typeof createLoggerMock>;
  let context: (arg: { req: any }) => any;

  beforeEach(async () => {
    logger = createLoggerMock();
    const service = new GraphqlAuthGatewayService(logger as any, createRedisMock() as any);
    context = (await service.createGqlOptions()).context as any;
  });

  it('should build the identity from the mind-* headers', () => {
    const ctx = context({
      req: {
        headers: {
          'mind-user-id': 'u1',
          'mind-user-roles': 'admin,user-viewer',
          'mind-session-expires-in': '2030-01-01T00:00:00.000Z',
          'mind-session-id': 'sess-1',
          'mind-request-ip': '203.0.113.7',
          'x-forwarded-for': '1.2.3.4',
        },
      },
    });

    expect(ctx.mindUserId).toBe('u1');
    expect(ctx.mindUserRoles).toEqual(['admin', 'user-viewer']);
    expect(ctx.mindSessionExpiresIn).toEqual(new Date('2030-01-01T00:00:00.000Z'));
    expect(ctx.mindSessionId).toBe('sess-1');
    expect(ctx.mindRequestInfo.ip).toBe('203.0.113.7');
  });

  it('should ignore X-Forwarded-For and req.ip (the router address) for the client ip', () => {
    const ctx = context({ req: { ip: '10.0.0.9', headers: { 'x-forwarded-for': '1.2.3.4' } } });
    expect(ctx.mindRequestInfo.ip).toBeNull();
  });

  it('should normalize mind-session-id like the other headers', () => {
    const base = { 'mind-user-id': 'u1', 'mind-user-roles': 'admin', 'mind-session-expires-in': '2030-01-01' };
    expect(context({ req: { headers: { ...base, 'mind-session-id': '  sess-1 ' } } }).mindSessionId).toBe('sess-1');
    expect(context({ req: { headers: { ...base, 'mind-session-id': '' } } }).mindSessionId).toBeNull();
  });

  it('should leave mindSessionId null when the header is absent', () => {
    const ctx = context({
      req: { headers: { 'mind-user-id': 'u1', 'mind-user-roles': 'admin', 'mind-session-expires-in': '2030-01-01' } },
    });
    expect(ctx.mindSessionId).toBeNull();
  });

  it('should return an empty identity without mind-user-id', () => {
    const ctx = context({ req: { headers: { 'user-agent': 'jest' } } });
    expect(ctx.mindUserId).toBeNull();
    expect(ctx.mindRequestInfo.userAgent).toBe('jest');
  });

  it('should throw 401 UNAUTHENTICATED and log when roles header is missing', () => {
    expect(() => context({ req: { headers: { 'mind-user-id': 'u1' } } })).toThrow(
      expect.objectContaining({ extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } } }),
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('should expose the federation options', async () => {
    const service = new GraphqlAuthGatewayService(logger as any, createRedisMock() as any);
    const options = await service.createGqlOptions();
    expect(options.playground).toBe(false);
  });
});
