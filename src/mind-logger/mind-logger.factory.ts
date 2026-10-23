import { transports, format } from 'winston';
import { WinstonModule } from 'nest-winston';
import { LoggerService } from '@nestjs/common';

const formatMeta = (meta) => {
  const splat = meta[Symbol.for('splat')];
  if (splat && splat.length) {
    const info = splat.length === 1 ? splat[0] : splat;
    if (info) delete info.context;
    if (info.stack && info.stack.length && !info.stack[0]) delete info.stack;
    if (!Object.keys(info).length) return '';
    return JSON.stringify(info);
  }
  return '';
};

const mtsLoggerFormat = format.printf(({ context, level, message, timestamp, ms, ...meta }) => {
  return `${timestamp} [${context?.module || context}][${level}][${context?.prefix || ''}] ${message} | ${
    meta && formatMeta(meta)
  } | ${ms}`;
});

export const MindLoggerFactory = (module: string): LoggerService => {
  const timestamp = format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' });
  // Só NODE_ENV === 'production' desliga cor e arquivo: lá o stdout vai para o coletor de log, que não deve
  // receber códigos ANSI, e o arquivo só ocuparia o disco. Qualquer outro valor (ou ausente) mantém os dois.
  const isProduction = process.env.NODE_ENV === 'production';
  const colorize = isProduction ? [] : [format.colorize()];
  const consoleFormat = format.combine(timestamp, format.ms(), ...colorize, format.prettyPrint(), mtsLoggerFormat);
  const fileFormat = format.combine(timestamp, format.ms(), mtsLoggerFormat);

  return WinstonModule.createLogger({
    level: process.env.DEBUG ? 'debug' : 'info',
    transports: [
      new transports.Console({ format: consoleFormat }),
      ...(isProduction
        ? []
        : [
            new transports.File({
              filename: `logs/${module}.log`,
              format: fileFormat,
              maxsize: 1024 * 1000 * 200, // 204,8mb
              maxFiles: 1,
              tailable: true,
            }),
          ]),
    ],
  });
};
