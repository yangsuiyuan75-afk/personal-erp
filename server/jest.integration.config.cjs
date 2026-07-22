module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.integration-spec.ts'],
  setupFiles: ['reflect-metadata'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  setupFilesAfterEnv: ['<rootDir>/test/setup-integration.ts'],
  testEnvironment: 'node',
  testTimeout: 30000,
};
