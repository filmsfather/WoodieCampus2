import { Pool } from 'pg';
export declare const pool: Pool;
export declare const checkDatabaseConnection: () => Promise<boolean>;
export declare const closeDatabaseConnection: () => Promise<void>;
export default pool;
