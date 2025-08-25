import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import {
  corsOptions,
  helmetOptions,
  generalRateLimit,
  authRateLimit,
  requestLogger,
  securityHeaders,
  securityErrorHandler
} from './middleware/security.js';
import apiRoutes from './routes/index.js';
import healthRoutes from './routes/health.js';
import { checkDatabaseConnection, closeDatabaseConnection } from './config/database.js';
import { connectRedis, checkRedisConnection, closeRedisConnection } from './config/redis.js';
import { runMigrations } from './database/migrations.js';
import { initializeSocketIO, socketUtils } from './config/socket.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Security middleware (order is important)
app.use(helmet(helmetOptions));
app.use(cors(corsOptions));
app.use(securityHeaders);

// Rate limiting
app.use(generalRateLimit);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Routes
app.use('/health', healthRoutes);
app.use('/api', apiRoutes);

// Error handling middleware (must be last)
app.use(securityErrorHandler);
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// Initialize connections and start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      logger.warn('Database connection failed - continuing with limited functionality');
    } else {
      // Run database migrations
      logger.info('Running database migrations...');
      await runMigrations();
    }
    
    // Connect to Redis
    const redisConnected = await connectRedis();
    if (!redisConnected) {
      logger.warn('Redis connection failed - continuing without cache');
    }
    
    // Initialize Socket.io
    const io = initializeSocketIO(httpServer);
    logger.info('Socket.io server initialized');
    
    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      logger.info(`Services status - Database: ${dbConnected ? 'connected' : 'disconnected'}, Redis: ${redisConnected ? 'connected' : 'disconnected'}, WebSocket: active`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down server...');
  
  try {
    await closeDatabaseConnection();
    await closeRedisConnection();
    logger.info('Server shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server
startServer();

export default app;