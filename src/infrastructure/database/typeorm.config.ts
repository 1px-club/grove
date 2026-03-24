import { join } from 'node:path';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { DatabaseConfig } from '../../config/database.config';

function resolveFileGlob(pattern: string): string {
  const extension = __filename.endsWith('.ts') ? 'ts' : 'js';
  return join(__dirname, pattern.replace('{ext}', extension));
}

function getBaseTypeOrmOptions(
  databaseConfig: DatabaseConfig,
): PostgresConnectionOptions {
  return {
    type: databaseConfig.type,
    host: databaseConfig.host,
    port: databaseConfig.port,
    username: databaseConfig.username,
    password: databaseConfig.password,
    database: databaseConfig.database,
    logging: databaseConfig.logging,
    synchronize: databaseConfig.synchronize,
  };
}

export function createTypeOrmModuleOptions(
  databaseConfig: DatabaseConfig,
): TypeOrmModuleOptions {
  return {
    ...getBaseTypeOrmOptions(databaseConfig),
    autoLoadEntities: true,
  };
}

export function createTypeOrmDataSourceOptions(
  databaseConfig: DatabaseConfig,
): DataSourceOptions {
  return {
    ...getBaseTypeOrmOptions(databaseConfig),
    entities: [resolveFileGlob('../../modules/**/*.entity.{ext}')],
    migrationsTableName: databaseConfig.migrationsTableName,
    migrations: [resolveFileGlob('./migrations/*.{ext}')],
  };
}
