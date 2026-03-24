import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabaseConfig } from '../../config/database.config';
import { createTypeOrmModuleOptions } from './typeorm.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createTypeOrmModuleOptions(getDatabaseConfig(configService)),
    }),
  ],
})
export class DatabaseModule {}
