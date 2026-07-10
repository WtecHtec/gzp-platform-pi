import path from 'path';
import winston from 'winston';
import 'winston-daily-rotate-file';

export default function createAppLogger(logDirectory: string) {
  const transport = new winston.transports.DailyRotateFile({
    dirname: logDirectory,
    filename: 'gzh-platform-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxFiles: '14d',
    maxSize: '20m',
    zippedArchive: true,
  });

  return winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    defaultMeta: { application: 'gzh-platform' },
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    transports: [
      transport,
      ...(process.env.NODE_ENV === 'development'
        ? [
            new winston.transports.Console({
              format: winston.format.simple(),
            }),
          ]
        : []),
    ],
  });
}

export function resolveLogDirectory(userDataPath: string): string {
  return path.join(userDataPath, 'logs');
}
