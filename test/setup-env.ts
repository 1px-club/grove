import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.TEST_DB_NAME ??= 'grove_test';
process.env.DB_NAME = process.env.TEST_DB_NAME;
