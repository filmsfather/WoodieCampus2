import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '../config/logger.js';

// CORS configuration
export const corsOptions = {
  origin: function (origin: string | undefined, callback: (error: Error | null, success?: boolean) => void) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5174', // Alternative Vite port
    ];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true, // Allow cookies and authorization headers
  optionsSuccessStatus: 200, // Support legacy browsers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma',
    'X-API-Key'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining']
};

// Helmet security headers configuration
export const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      childSrc: ["'self'"],
      workerSrc: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for Socket.io compatibility
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
};

// General rate limiting
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Strict rate limiting for authentication routes
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login attempts per windowMs
  message: {
    error: 'Too many login attempts from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req: Request, res: Response) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too many login attempts from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Password reset rate limiting
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 password reset attempts per hour
  message: {
    error: 'Too many password reset attempts from this IP, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Password reset rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many password reset attempts from this IP, please try again later.',
      retryAfter: '1 hour'
    });
  }
});

// API rate limiting for authenticated users
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Higher limit for authenticated API calls
  message: {
    error: 'API rate limit exceeded, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // keyGenerator: (req: Request) => {
  //   // Use user ID if available, otherwise fall back to IP
  //   const authHeader = req.headers.authorization;
  //   if (authHeader) {
  //     try {
  //       const token = authHeader.split(' ')[1];
  //       // Simple token parsing for rate limiting (not for security)
  //       const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  //       return `user:${payload.userId}`;
  //     } catch (error) {
  //       // Fall back to IP if token parsing fails
  //       return `ip:${req.ip}`;
  //     }
  //   }
  //   return `ip:${req.ip}`;
  // },
  handler: (req: Request, res: Response) => {
    logger.warn(`API rate limit exceeded for ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'API rate limit exceeded, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Request size limiting middleware
export const requestSizeLimit = (limit: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const sizeLimit = parseSize(limit);
      const requestSize = parseInt(contentLength);
      
      if (requestSize > sizeLimit) {
        logger.warn(`Request size limit exceeded: ${requestSize} bytes (limit: ${sizeLimit})`);
        return res.status(413).json({
          error: 'Request entity too large',
          limit: limit,
          received: `${Math.round(requestSize / 1024)}KB`
        });
      }
    }
    
    next();
  };
};

// Helper function to parse size strings like '10mb', '1gb'
function parseSize(size: string): number {
  const units: Record<string, number> = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)([kmg]?b)$/);
  if (!match) return 10 * 1024 * 1024; // Default 10MB
  
  const [, value, unit] = match;
  return parseFloat(value) * (units[unit] || 1);
}

// IP whitelist middleware
export const ipWhitelist = (allowedIps: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (allowedIps.length === 0) {
      // If no whitelist specified, allow all
      return next();
    }
    
    if (!clientIp || !allowedIps.includes(clientIp)) {
      logger.warn(`Blocked request from unauthorized IP: ${clientIp}`);
      return res.status(403).json({
        error: 'Access denied from this IP address'
      });
    }
    
    next();
  };
};

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const originalSend = res.send;
  
  // Override res.send to log response
  res.send = function(body) {
    const duration = Date.now() - start;
    
    // Log request details
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length') || body?.length || 0
    });
    
    return originalSend.call(this, body);
  };
  
  next();
};

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Remove server signature
  res.removeHeader('X-Powered-By');
  
  // Set custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Cache control for API responses
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
};

// Error handling for security middleware
export const securityErrorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  if (error.code === 'CORS_ERROR') {
    logger.warn(`CORS error for ${req.ip} on ${req.path}: ${error.message}`);
    return res.status(403).json({
      error: 'CORS policy violation',
      message: 'Request blocked by CORS policy'
    });
  }
  
  if (error.code === 'RATE_LIMIT_ERROR') {
    logger.warn(`Rate limit error for ${req.ip} on ${req.path}`);
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later'
    });
  }
  
  // Pass other errors to default error handler
  next(error);
};