import { logger } from '../config/logger.js';
export const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    // Log error
    logger.error({
        message: err.message,
        statusCode,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
    });
    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(statusCode).json({
        error: {
            message: isDevelopment ? message : 'Something went wrong',
            statusCode,
            ...(isDevelopment && { stack: err.stack }),
        },
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
    });
};
export const createError = (message, statusCode = 500) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.isOperational = true;
    return error;
};
export default errorHandler;
//# sourceMappingURL=errorHandler.js.map