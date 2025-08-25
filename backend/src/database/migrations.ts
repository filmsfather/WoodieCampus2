import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';

export interface Migration {
  id: string;
  description: string;
  up: string;
  down: string;
}

// Migration table creation
const createMigrationsTable = `
  CREATE TABLE IF NOT EXISTS migrations (
    id VARCHAR(255) PRIMARY KEY,
    description VARCHAR(500),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

// Sample initial migrations
export const migrations: Migration[] = [
  {
    id: '001_create_users_table',
    description: 'Create users table with basic authentication fields',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        is_verified BOOLEAN DEFAULT false,
        role VARCHAR(50) DEFAULT 'student',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `,
    down: 'DROP TABLE IF EXISTS users CASCADE;'
  },
  {
    id: '002_create_courses_table',
    description: 'Create courses table for educational content',
    up: `
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        instructor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        price DECIMAL(10,2) DEFAULT 0.00,
        is_published BOOLEAN DEFAULT false,
        category VARCHAR(100),
        difficulty_level VARCHAR(50) DEFAULT 'beginner',
        duration_hours INTEGER DEFAULT 0,
        thumbnail_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_courses_instructor ON courses(instructor_id);
      CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);
      CREATE INDEX IF NOT EXISTS idx_courses_published ON courses(is_published);
    `,
    down: 'DROP TABLE IF EXISTS courses CASCADE;'
  },
  {
    id: '003_create_enrollments_table',
    description: 'Create enrollments table to track user course participation',
    up: `
      CREATE TABLE IF NOT EXISTS enrollments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        progress_percentage INTEGER DEFAULT 0,
        completed_at TIMESTAMP NULL,
        UNIQUE(user_id, course_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
      CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
    `,
    down: 'DROP TABLE IF EXISTS enrollments CASCADE;'
  }
];

// Check if migration has been executed
export const isMigrationExecuted = async (migrationId: string): Promise<boolean> => {
  try {
    const result = await pool.query('SELECT id FROM migrations WHERE id = $1', [migrationId]);
    return result.rows.length > 0;
  } catch (error) {
    logger.error(`Error checking migration ${migrationId}:`, error);
    return false;
  }
};

// Execute a single migration
export const executeMigration = async (migration: Migration): Promise<boolean> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Execute migration SQL
    await client.query(migration.up);
    
    // Record migration execution
    await client.query(
      'INSERT INTO migrations (id, description) VALUES ($1, $2)',
      [migration.id, migration.description]
    );
    
    await client.query('COMMIT');
    logger.info(`Migration executed successfully: ${migration.id}`);
    return true;
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Migration failed: ${migration.id}`, error);
    return false;
  } finally {
    client.release();
  }
};

// Run all pending migrations
export const runMigrations = async (): Promise<boolean> => {
  try {
    // Create migrations table if it doesn't exist
    await pool.query(createMigrationsTable);
    logger.info('Migrations table ready');
    
    let allSuccessful = true;
    
    for (const migration of migrations) {
      const isExecuted = await isMigrationExecuted(migration.id);
      
      if (!isExecuted) {
        logger.info(`Running migration: ${migration.id}`);
        const success = await executeMigration(migration);
        
        if (!success) {
          allSuccessful = false;
          break;
        }
      } else {
        logger.info(`Migration already executed: ${migration.id}`);
      }
    }
    
    if (allSuccessful) {
      logger.info('All migrations completed successfully');
    }
    
    return allSuccessful;
    
  } catch (error) {
    logger.error('Error running migrations:', error);
    return false;
  }
};

// Rollback a specific migration
export const rollbackMigration = async (migration: Migration): Promise<boolean> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Execute rollback SQL
    await client.query(migration.down);
    
    // Remove migration record
    await client.query('DELETE FROM migrations WHERE id = $1', [migration.id]);
    
    await client.query('COMMIT');
    logger.info(`Migration rolled back successfully: ${migration.id}`);
    return true;
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Migration rollback failed: ${migration.id}`, error);
    return false;
  } finally {
    client.release();
  }
};

export default { runMigrations, isMigrationExecuted, executeMigration, rollbackMigration };