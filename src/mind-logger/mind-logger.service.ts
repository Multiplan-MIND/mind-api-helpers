import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { MindLoggerFactory } from './mind-logger.factory';
import { jsonError } from '../mind-helpers/error.helper';

@Injectable({
  scope: Scope.TRANSIENT,
})
export class MindLoggerService {
  private module?: string;
  private method?: string;
  private infos?: string[];

  private loggerService?: LoggerService;

  private prefix?: string;

  info(message: string) {
    this.loggerService?.log(message, this.prefix);
  }
  error(message: string, err?: Error) {
    if (err) message += ` | ${JSON.stringify(jsonError(err))}`;
    this.loggerService?.error(message, err?.stack, this.prefix);
  }
  warn(message: string) {
    this.loggerService?.warn(message, this.prefix);
  }
  debug?(message: string) {
    this.loggerService?.debug(message, this.prefix);
  }
  verbose?(message: string) {
    this.loggerService?.verbose(message, this.prefix);
  }

  setModule(module: string) {
    this.module = module;

    this.prefix = `${process.pid}|${this.module}`;
    this.loggerService = MindLoggerFactory(this.module);
    this.loggerService.debug('Fabricated Logger', this.prefix);
  }

  setMethod(method: string, infos?: string[]) {
    this.method = method;
    this.infos = infos;
    this.prefix = `${process.pid}|${this.module}|${this.method}`;
    if (this.infos) {
      this.prefix += '#';
      for (let i = 0; i < this.infos.length; i++) {
        this.prefix += this.infos[i];
        if (i + 1 != this.infos.length) this.prefix += ';';
      }
    }
  }
}
