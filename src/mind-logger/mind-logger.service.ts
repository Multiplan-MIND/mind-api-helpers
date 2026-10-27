import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { MindLoggerFactory } from './mind-logger.factory';
import { jsonError } from '../mind-helpers/error.helper';
import { currentTraceId } from '../mind-tracing/trace-id';

@Injectable({
  scope: Scope.TRANSIENT,
})
export class MindLoggerService {
  private module?: string;

  private loggerService?: LoggerService;

  info(message: string, prefix?: string) {
    this.loggerService?.log(message, this.context(prefix));
  }
  error(message: string, prefix?: string, err?: unknown) {
    if (err) message += ` | ${JSON.stringify(jsonError(err))}`;
    this.loggerService?.error(message, (err as Error)?.stack, this.context(prefix));
  }
  warn(message: string, prefix?: string) {
    this.loggerService?.warn(message, this.context(prefix));
  }
  debug?(message: string, prefix?: string) {
    this.loggerService?.debug(message, this.context(prefix));
  }
  verbose?(message: string, prefix?: string) {
    this.loggerService?.verbose(message, this.context(prefix));
  }

  // The trace id is read here, at the call site, because winston may format the line after the active span has ended.
  private context(prefix?: string) {
    const traceId = currentTraceId();
    return { module: this.module, prefix, ...(traceId ? { traceId } : {}) };
  }

  setModule(module: string) {
    this.module = module;

    this.loggerService = MindLoggerFactory(this.module);
    this.loggerService.debug('Fabricated Logger', { module });
  }
}
