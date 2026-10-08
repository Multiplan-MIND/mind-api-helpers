import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface RsaKeys {
  kid: string;
  privateKeyPem: string;
  jwk: Record<string, any>;
}

// Gerar RSA 2048 custa ~100ms; os specs devem reutilizar o par entre testes
export function createRsaKeys(kid = 'test-kid'): RsaKeys {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  return { kid, privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), jwk };
}

export function signToken(keys: RsaKeys, payload: Record<string, any>, options: jwt.SignOptions = {}): string {
  return jwt.sign(payload, keys.privateKeyPem, { algorithm: 'RS256', keyid: keys.kid, ...options });
}

export function createRedisMock() {
  return { get: jest.fn(), set: jest.fn(), eval: jest.fn(), pipeline: jest.fn() };
}

export function createLoggerMock() {
  return { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
}
