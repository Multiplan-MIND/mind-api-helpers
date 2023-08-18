import { Provider } from '@nestjs/common';
import { modulesForLoggers } from './mind-logger.decorator';
import { MindLoggerService } from './mind-logger.service';

function mindLoggerFactory(logger: MindLoggerService, module: string) {
  if (module) {
    logger.setModule(module);
  }
  return logger;
}

function createMindLoggerProvider(module: string): Provider<MindLoggerService> {
  return {
    provide: `MindLoggerService${module}`,
    useFactory: (logger) => mindLoggerFactory(logger, module),
    inject: [MindLoggerService],
  };
}

export function createMindLoggerProviders(): Array<
  Provider<MindLoggerService>
> {
  return modulesForLoggers.map((prefix) => createMindLoggerProvider(prefix));
}
