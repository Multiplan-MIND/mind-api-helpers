import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { MindLoggerFactory } from './mind-logger.factory';
import { jsonError } from '../mind-helpers/error.helper';

@Injectable({
  scope: Scope.TRANSIENT,
})
export class MindLoggerService {
  private module?: string;

  private loggerService?: LoggerService;

  info(message: string, prefix: string) {
    this.loggerService?.log(message, { module: this.module, prefix });
  }
  error(message: string, prefix: string, err?: Error) {
    if (err) message += ` | ${JSON.stringify(jsonError(err))}`;
    this.loggerService?.error(message, err?.stack, { module: this.module, prefix });
  }
  warn(message: string, prefix: string) {
    this.loggerService?.warn(message, { module: this.module, prefix });
  }
  debug?(message: string, prefix: string) {
    this.loggerService?.debug(message, { module: this.module, prefix });
  }
  verbose?(message: string, prefix: string) {
    this.loggerService?.verbose(message, { module: this.module, prefix });
  }

  setModule(module: string) {
    this.module = module;

    this.loggerService = MindLoggerFactory(this.module);
    this.loggerService.debug('Fabricated Logger');
  }
}
