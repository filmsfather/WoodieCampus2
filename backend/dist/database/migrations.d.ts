export interface Migration {
    id: string;
    description: string;
    up: string;
    down: string;
}
export declare const migrations: Migration[];
export declare const isMigrationExecuted: (migrationId: string) => Promise<boolean>;
export declare const executeMigration: (migration: Migration) => Promise<boolean>;
export declare const runMigrations: () => Promise<boolean>;
export declare const rollbackMigration: (migration: Migration) => Promise<boolean>;
declare const _default: {
    runMigrations: () => Promise<boolean>;
    isMigrationExecuted: (migrationId: string) => Promise<boolean>;
    executeMigration: (migration: Migration) => Promise<boolean>;
    rollbackMigration: (migration: Migration) => Promise<boolean>;
};
export default _default;
