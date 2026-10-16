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
  // Cor só com terminal (desenvolvimento): no pod o stdout vai para o coletor de log, que não deve receber códigos ANSI.
  const colorize = process.stdout.isTTY ? [format.colorize()] : [];
  const consoleFormat = format.combine(timestamp, format.ms(), ...colorize, format.prettyPrint(), mtsLoggerFormat);
  const fileFormat = format.combine(timestamp, format.ms(), mtsLoggerFormat);

  // O Kubernetes injeta essa variável em todo pod. Lá o coletor lê o stdout, e o arquivo só ocuparia o disco do nó.
  const inKubernetes = !!process.env.KUBERNETES_SERVICE_HOST;

  return WinstonModule.createLogger({
    level: process.env.DEBUG ? 'debug' : 'info',
    transports: [
      new transports.Console({ format: consoleFormat }),
      ...(inKubernetes
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
