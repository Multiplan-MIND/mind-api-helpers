import { Test, TestingModule } from '@nestjs/testing';
import { MindLoggerService } from './mind-logger.service';

describe('MindLoggerService', () => {
  let service: MindLoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MindLoggerService],
    }).compile();

    service = module.get<MindLoggerService>(MindLoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
