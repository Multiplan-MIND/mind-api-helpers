import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { MindLoggerFactory } from './mind-logger.factory';

@Injectable({
  scope: Scope.TRANSIENT
})
export class MindLoggerService {
  private module?: string;
  private method?: string;
  private infos?: [string];

  private loggerService?: LoggerService;

  private prefix?: string;

  info(message: string) {
    this.loggerService?.log(message, this.prefix);
  }
  error(message: string, stack?: string) {
    this.loggerService?.error(message, stack, this.prefix);
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

  setMethod(method: string, infos?: [string]) {
    this.method = method;
    this.infos = infos;
    this.prefix = `${process.pid}|${this.module}|${this.method}`;
    if (this.infos) {
      let infStr = '';
      for (let index = 0; index < infos.length; index++) {
        const inf = infos[index];
        infStr += inf;
        if (index + 1 !== infos.length) infStr += '|';
      }
      this.prefix = `${this.prefix}-${infStr}`;}
  }
}
