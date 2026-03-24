import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, getValidatedEnv } from './env.validation';

export type DatabaseConfig = {
  type: 'postgres';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  logging: boolean;
  synchronize: false;
  migrationsTableName: string;
};

export function getDatabaseConfig(
  source: EnvironmentVariables | ConfigService = getValidatedEnv(),
): DatabaseConfig {
  const env =
    source instanceof ConfigService
      ? {
          APP_PORT: source.getOrThrow<number>('APP_PORT'),
          DB_HOST: source.getOrThrow<string>('DB_HOST'),
          DB_PORT: source.getOrThrow<number>('DB_PORT'),
          DB_USERNAME: source.getOrThrow<string>('DB_USERNAME'),
          DB_PASSWORD: source.getOrThrow<string>('DB_PASSWORD'),
          DB_NAME: source.getOrThrow<string>('DB_NAME'),
        }
      : source;

  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    logging: false,
    synchronize: false,
    migrationsTableName: 'typeorm_migrations',
  };
}
