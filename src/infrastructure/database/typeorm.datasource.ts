import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../../config/database.config';
import { getValidatedEnv } from '../../config/env.validation';
import { createTypeOrmDataSourceOptions } from './typeorm.config';

const typeormDataSource = new DataSource(
  createTypeOrmDataSourceOptions(getDatabaseConfig(getValidatedEnv())),
);

export default typeormDataSource;
