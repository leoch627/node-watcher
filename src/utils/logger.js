const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'node-watcher' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../logs/error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../logs/combined.log') 
    })
  ]
});

// Always log to the console as well, so `docker logs` / `docker compose logs` show what happened
// (the deploy script reads them to explain failures). Colours only outside production.
// LOG_CONSOLE=false turns this off.
if (process.env.LOG_CONSOLE !== 'false') {
  logger.add(new winston.transports.Console({
    format: process.env.NODE_ENV === 'production'
      ? winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
      )
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  }));
}

module.exports = logger;
