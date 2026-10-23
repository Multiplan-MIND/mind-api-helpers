import * as jwt from 'jsonwebtoken';
import * as jwkToPem from 'jwk-to-pem';

import { createRsaKeys, signToken } from './jwt.test-support';

describe('jwt.test-support', () => {
  it('should sign a token verifiable with the public JWK converted to PEM', () => {
    const keys = createRsaKeys('kid-1');
    const token = signToken(keys, { mindUserId: 'u1' });

    const decoded = jwt.verify(token, jwkToPem(keys.jwk as any), { algorithms: ['RS256'] }) as jwt.JwtPayload;

    expect(decoded.mindUserId).toBe('u1');
    expect(jwt.decode(token, { complete: true }).header.kid).toBe('kid-1');
  });
});
