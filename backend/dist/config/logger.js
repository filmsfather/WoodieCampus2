import winston from 'winston';
const { combine, timestamp, errors, printf, colorize, json } = winston.format;
// Custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
});
// Create logger instance
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), process.env.NODE_ENV === 'production' ? json() : combine(colorize(), logFormat)),
    transports: [
        // Console transport
        new winston.transports.Console({
            silent: process.env.NODE_ENV === 'test',
        }),
        // File transports for production
        ...(process.env.NODE_ENV === 'production' ? [
            new winston.transports.File({
                filename: 'logs/error.log',
                level: 'error',
                maxsize: 5242880, // 5MB
                maxFiles: 5,
            }),
            new winston.transports.File({
                filename: 'logs/combined.log',
                maxsize: 5242880, // 5MB
                maxFiles: 5,
            }),
        ] : []),
    ],
});
export default logger;
//# sourceMappingURL=logger.js.map