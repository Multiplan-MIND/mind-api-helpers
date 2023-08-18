import { Inject } from '@nestjs/common';

export const modulesForLoggers: string[] = new Array<string>();

export function MindLogger(module: string = '') {
  if (!modulesForLoggers.includes(module)) {
    modulesForLoggers.push(module);
  }
  return Inject(`MindLoggerService${module}`);
}
