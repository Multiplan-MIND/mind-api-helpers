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
  return `${timestamp} [${context}] ${level}: ${message} | ${meta && formatMeta(meta)} | ${ms}`;
});

export const MindLoggerFactory = (module: string): LoggerService => {
  const consoleFormat = format.combine(
    format.timestamp(),
    format.ms(),
    format.colorize(),
    format.prettyPrint(),
    mtsLoggerFormat,
  );
  const fileFormat = format.combine(format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), format.ms(), mtsLoggerFormat);

  return WinstonModule.createLogger({
    level: process.env.DEBUG ? 'debug' : 'info',
    transports: [
      new transports.Console({ format: consoleFormat }),
      new transports.File({
        filename: `logs/${module}.log`,
        format: fileFormat,
      }),
    ],
  });
};
