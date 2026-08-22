import { LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { createMindLoggerProviders } from './mind-logger.providers';
import { MindLoggerService } from './mind-logger.service';
import { logPrefix } from './mind-logger.util';
import { MindError } from '../mind-helpers/error.helper';

type WinstonMock = { log: jest.Mock; error: jest.Mock; warn: jest.Mock; debug: jest.Mock; verbose: jest.Mock };

describe('MindLoggerService', () => {
  const prefix = logPrefix('TestMethod', ['info-1', 'info-2']);

  let mindLoggerService: MindLoggerService;
  let winston: WinstonMock;

  const lastError = () => {
    const [message, stack, context] = winston.error.mock.calls[winston.error.mock.calls.length - 1];
    return { message, stack, context };
  };

  beforeEach(async () => {
    const modulesLoggerProviders = createMindLoggerProviders();
    const moduleRef = await Test.createTestingModule({
      providers: [MindLoggerService, ...modulesLoggerProviders],
    }).compile();

    mindLoggerService = await moduleRef.resolve<MindLoggerService>(MindLoggerService);
    mindLoggerService.setModule('TestModule');

    // replaces winston with mocks to inspect what the service forwards
    winston = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() };
    mindLoggerService['loggerService'] = winston as unknown as LoggerService;
  });

  describe('error with an Error', () => {
    it('should append the serialized error and forward the stack', () => {
      const err = new Error('Errorrrr');

      mindLoggerService.error('Error in save', prefix, err);

      // Error has name/message as non-enumerable properties, so it serializes as {}
      expect(lastError().message).toBe('Error in save | {}');
      expect(lastError().stack).toBe(err.stack);
      expect(lastError().context).toEqual({ module: 'TestModule', prefix });
    });

    it('should keep the fields of a MindError', () => {
      const err = new MindError('loyalty.exists', 'Loyalty already exists', { context: { plate: 'ABC1234' } });

      mindLoggerService.error('Error in save', prefix, err);

      expect(lastError().message).toContain('"code":"loyalty.exists"');
      expect(lastError().message).toContain('"plate":"ABC1234"');
      expect(lastError().stack).toBe(err.stack);
    });
  });

  describe('error with a value that is not an Error', () => {
    it('should accept a thrown string', () => {
      mindLoggerService.error('Error in save', prefix, 'Errorrrr');

      expect(lastError().message).toBe('Error in save | "Errorrrr"');
      expect(lastError().stack).toBeUndefined();
    });

    it('should keep every field of a plain object', () => {
      const err = { code: 11000, message: 'duplicate key', keyValue: { cpf: '00000000000' } };

      mindLoggerService.error('Error in save', prefix, err);

      expect(lastError().message).toContain('"code":11000');
      expect(lastError().message).toContain('"message":"duplicate key"');
      expect(lastError().message).toContain('"cpf":"00000000000"');
      expect(lastError().stack).toBeUndefined();
    });

    it('should accept a number', () => {
      mindLoggerService.error('Error in save', prefix, 404);

      expect(lastError().message).toBe('Error in save | 404');
    });

    it('should forward the stack of an object that carries one', () => {
      const err = { message: 'Errorrrr', stack: 'Error: Errorrrr\n    at somewhere' };

      mindLoggerService.error('Error in save', prefix, err);

      expect(lastError().stack).toBe(err.stack);
    });

    it('should not append anything when there is no error', () => {
      mindLoggerService.error('Error in save', prefix);

      expect(lastError().message).toBe('Error in save');
      expect(lastError().stack).toBeUndefined();
    });

    it('should ignore null and undefined', () => {
      mindLoggerService.error('Error in save', prefix, null);
      expect(lastError().message).toBe('Error in save');

      mindLoggerService.error('Error in save', prefix, undefined);
      expect(lastError().message).toBe('Error in save');
    });

    it('should ignore falsy values, since the check is truthiness based', () => {
      mindLoggerService.error('Error in save', prefix, 0);
      expect(lastError().message).toBe('Error in save');

      mindLoggerService.error('Error in save', prefix, '');
      expect(lastError().message).toBe('Error in save');
    });

    // known limitation: the `JSON.stringify` in error() does not handle circular references, so logging
    // causes the flow to break. If the service handles this case, change to `not.toThrow()`.
    it('should throw on a circular reference, which is a known limitation', () => {
      const err: Record<string, unknown> = { code: 11000 };
      err.self = err;

      expect(() => mindLoggerService.error('Error in save', prefix, err)).toThrow(TypeError);
    });
  });

  describe('error with an axios error', () => {
    const buildAxiosError = () => ({
      isAxiosError: true,
      name: 'AxiosError',
      message: 'Request failed with status code 401',
      stack: 'AxiosError: Request failed with status code 401\n    at somewhere',
      code: 'ERR_BAD_REQUEST',
      response: {
        status: 401,
        statusText: 'Unauthorized',
        data: { error: 'invalid' },
        headers: {},
        config: {
          url: '/loyalty',
          headers: { Authorization: 'valor-sensivel-nao-deve-vazar', 'X-API-KEY': 'chave-nao-deve-vazar' },
        },
      },
    });

    it('should log the response without the sensitive headers', () => {
      mindLoggerService.error('Error in save', prefix, buildAxiosError());

      expect(lastError().message).toContain('"status":401');
      expect(lastError().message).toContain('"code":"ERR_BAD_REQUEST"');
      expect(lastError().message).not.toContain('valor-sensivel-nao-deve-vazar');
      expect(lastError().message).not.toContain('chave-nao-deve-vazar');
    });

    it('should forward the stack even though it is not an Error instance', () => {
      const err = buildAxiosError();

      mindLoggerService.error('Error in save', prefix, err);

      expect(lastError().stack).toBe(err.stack);
    });

    it('should strip the sensitive headers from the error object itself', () => {
      const err = buildAxiosError();

      mindLoggerService.error('Error in save', prefix, err);

      // side effect of jsonError: headers are deleted from the received object, not from a copy
      expect(err.response.config.headers).toEqual({});
    });
  });

  describe('other levels', () => {
    it('should forward info to log', () => {
      mindLoggerService.info('Test Info', prefix);

      expect(winston.log).toHaveBeenCalledWith('Test Info', { module: 'TestModule', prefix });
    });

    it('should forward warn', () => {
      mindLoggerService.warn('Test Warn', prefix);

      expect(winston.warn).toHaveBeenCalledWith('Test Warn', { module: 'TestModule', prefix });
    });

    it('should forward debug and verbose', () => {
      mindLoggerService.debug('Test Debug', prefix);
      mindLoggerService.verbose('Test Verbose', prefix);

      expect(winston.debug).toHaveBeenCalledWith('Test Debug', { module: 'TestModule', prefix });
      expect(winston.verbose).toHaveBeenCalledWith('Test Verbose', { module: 'TestModule', prefix });
    });

    it('should work without a prefix', () => {
      mindLoggerService.info('Test Info without prefix');

      expect(winston.log).toHaveBeenCalledWith('Test Info without prefix', { module: 'TestModule', prefix: undefined });
    });
  });

  describe('with the real winston logger', () => {
    it('should not throw on any level', () => {
      const service = mindLoggerService;
      service.setModule('TestModule');

      expect(() => {
        service.info('Test Info without prefix');
        service.error('Test Error without prefix', null, new Error('Errorrrr'));
        service.info('Test Info', prefix);
        service.error('Test Error', prefix, new Error('Errorrrr'));
        service.error('Test Error with a string', prefix, 'Errorrrr');
        service.error('Test Error with an object', prefix, { code: 11000 });
        service.warn('Test Warn', prefix);
        service.debug('Test Debug', prefix);
        service.verbose('Test Verbose', prefix);
      }).not.toThrow();
    });
  });
});
