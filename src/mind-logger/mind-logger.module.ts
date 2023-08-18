import { DynamicModule } from '@nestjs/common';
import { MindLoggerService } from './mind-logger.service';
import { createMindLoggerProviders } from './mind-logger.providers';

export class MindLoggerModule {
  static forRoot(): DynamicModule {
    const modulesLoggerProviders = createMindLoggerProviders();
    return {
      module: MindLoggerModule,
      providers: [MindLoggerService, ...modulesLoggerProviders],
      exports: [MindLoggerService, ...modulesLoggerProviders],
    };
  }
}
