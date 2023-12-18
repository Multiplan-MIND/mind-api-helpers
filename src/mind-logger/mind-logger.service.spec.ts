import { Test } from '@nestjs/testing';
import { createMindLoggerProviders } from './mind-logger.providers';
import { MindLoggerService } from './mind-logger.service';
import { logPrefix } from './mind-logger.util';

describe('MindLoggerService', () => {
  let mindLoggerService: MindLoggerService;

  beforeEach(async () => {
    const modulesLoggerProviders = createMindLoggerProviders();
    const moduleRef = await Test.createTestingModule({
      providers: [MindLoggerService, ...modulesLoggerProviders],
    }).compile();

    mindLoggerService = await moduleRef.resolve<MindLoggerService>(MindLoggerService);
  });

  describe('check log', () => {
    it('should return', async () => {
      mindLoggerService.setModule('TestModule');
      const prefix = logPrefix('TestMethod', ['info-1', 'info-2']);
      mindLoggerService.info('Test Info', prefix);
      mindLoggerService.error('Test Error', prefix, new Error('Errorrrr'));
      mindLoggerService.warn('Test Warn', prefix);
      mindLoggerService.debug('Test Debug', prefix);
      mindLoggerService.verbose('Test Verbose', prefix);
    });
  });
});
