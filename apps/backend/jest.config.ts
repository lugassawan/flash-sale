import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.tokens.ts',
    '!src/**/*.orm-entity.ts',
    '!src/**/*.dto.ts',
    '!src/core/domain/**/errors/*.ts',
    '!src/core/domain/**/events/*.ts',
    '!src/core/domain/**/repositories/*.ts',
    '!src/application/errors/*.ts',
    '!src/application/ports/*.ts',
    '!src/infrastructure/errors/*.ts',
    '!src/infrastructure/rate-limiting/rate-limiter.strategy.ts',
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 60,
      functions: 75,
      lines: 80,
    },
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
