module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/test'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*-spec.ts', '<rootDir>/test/**/*.spec.ts'],
  testTimeout: 30000,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
};
