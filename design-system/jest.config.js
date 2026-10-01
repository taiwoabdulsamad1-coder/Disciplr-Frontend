/**
 * Jest configuration for @disciplr/design-system
 *
 * Enforces deterministic invariants for test runners, CI environments, and programmatic consumers.
 * Supports both CommonJS and ESM module loading without runtime or syntax errors.
 *
 * Exported as a callable function (with static properties) so Jest receives a clean configuration
 * object without unknown option warnings, while remaining fully backward-compatible with
 * object property access and named imports.
 */

const DEFAULT_COVERAGE_METRICS = ['branches', 'functions', 'lines', 'statements'];

const DEFAULT_GLOBAL_THRESHOLDS = Object.freeze({
  branches: 80,
  functions: 80,
  lines: 80,
  statements: 80,
});

const DEFAULT_ROOTS = Object.freeze(['<rootDir>/src']);
const DEFAULT_TEST_MATCH = Object.freeze([
  '**/__tests__/**/*.ts',
  '**/?(*.)+(spec|test).ts',
]);
const DEFAULT_COLLECT_COVERAGE_FROM = Object.freeze([
  'src/**/*.ts',
  '!src/**/*.d.ts',
  '!src/**/__tests__/**',
]);

const DEFAULT_CONFIG = Object.freeze({
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: DEFAULT_ROOTS,
  testMatch: DEFAULT_TEST_MATCH,
  collectCoverageFrom: DEFAULT_COLLECT_COVERAGE_FROM,
  coverageThreshold: Object.freeze({
    global: DEFAULT_GLOBAL_THRESHOLDS,
  }),
});

/**
 * Validates a single coverage threshold value.
 * Boundary: [0, 100]. Must be a finite number.
 *
 * @param {unknown} value
 * @param {string} metric
 * @returns {number}
 */
function validateThreshold(value, metric) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError(
      `Coverage threshold for '${metric}' must be a finite number, received: ${
        Number.isNaN(value) ? 'NaN' : typeof value === 'number' ? String(value) : typeof value
      }`
    );
  }
  if (value < 0 || value > 100) {
    throw new RangeError(
      `Coverage threshold for '${metric}' must be between 0 and 100, received: ${value}`
    );
  }
  return value;
}

/**
 * Validates and deduplicates an array of string patterns or paths.
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string[]}
 */
function validateAndDeduplicateStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array of strings, received: ${typeof value}`);
  }
  if (value.length === 0) {
    throw new RangeError(`${fieldName} must contain at least one pattern or path`);
  }
  const seen = new Set();
  const result = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== 'string') {
      throw new TypeError(
        `${fieldName}[${i}] must be a non-empty string, received: ${typeof item}`
      );
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      throw new RangeError(`${fieldName}[${i}] cannot be an empty or whitespace-only string`);
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Validates a non-empty string field.
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
function validateNonEmptyString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string, received: ${typeof value}`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new RangeError(`${fieldName} cannot be empty or whitespace-only`);
  }
  return trimmed;
}

/**
 * Validates a complete Jest configuration object against required invariants.
 *
 * @param {unknown} config
 * @returns {boolean}
 */
function validateJestConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('Jest configuration must be a non-null object');
  }

  validateNonEmptyString(config.preset, 'preset');
  validateNonEmptyString(config.testEnvironment, 'testEnvironment');
  validateAndDeduplicateStringArray(config.roots, 'roots');
  validateAndDeduplicateStringArray(config.testMatch, 'testMatch');
  validateAndDeduplicateStringArray(config.collectCoverageFrom, 'collectCoverageFrom');

  if (
    !config.coverageThreshold ||
    typeof config.coverageThreshold !== 'object' ||
    Array.isArray(config.coverageThreshold)
  ) {
    throw new TypeError('coverageThreshold must be a non-null object');
  }

  const globalThresholds = config.coverageThreshold.global;
  if (!globalThresholds || typeof globalThresholds !== 'object' || Array.isArray(globalThresholds)) {
    throw new TypeError('coverageThreshold.global must be a non-null object');
  }

  for (const metric of DEFAULT_COVERAGE_METRICS) {
    validateThreshold(globalThresholds[metric], metric);
  }

  return true;
}

/**
 * Factory function to create an isolated, validated Jest configuration.
 * Safe for retries, concurrency, and partial failure recovery.
 *
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function createJestConfig(overrides = {}) {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new TypeError(
      `Overrides must be a non-null object, received: ${
        overrides === null ? 'null' : Array.isArray(overrides) ? 'array' : typeof overrides
      }`
    );
  }

  const preset = overrides.preset !== undefined
    ? validateNonEmptyString(overrides.preset, 'preset')
    : DEFAULT_CONFIG.preset;

  const testEnvironment = overrides.testEnvironment !== undefined
    ? validateNonEmptyString(overrides.testEnvironment, 'testEnvironment')
    : DEFAULT_CONFIG.testEnvironment;

  const roots = overrides.roots !== undefined
    ? validateAndDeduplicateStringArray(overrides.roots, 'roots')
    : [...DEFAULT_CONFIG.roots];

  const testMatch = overrides.testMatch !== undefined
    ? validateAndDeduplicateStringArray(overrides.testMatch, 'testMatch')
    : [...DEFAULT_CONFIG.testMatch];

  const collectCoverageFrom = overrides.collectCoverageFrom !== undefined
    ? validateAndDeduplicateStringArray(overrides.collectCoverageFrom, 'collectCoverageFrom')
    : [...DEFAULT_CONFIG.collectCoverageFrom];

  let mergedGlobalThresholds = { ...DEFAULT_CONFIG.coverageThreshold.global };
  if (overrides.coverageThreshold !== undefined) {
    if (
      overrides.coverageThreshold === null ||
      typeof overrides.coverageThreshold !== 'object' ||
      Array.isArray(overrides.coverageThreshold)
    ) {
      throw new TypeError('coverageThreshold override must be a non-null object');
    }

    if (overrides.coverageThreshold.global !== undefined) {
      const customGlobal = overrides.coverageThreshold.global;
      if (customGlobal === null || typeof customGlobal !== 'object' || Array.isArray(customGlobal)) {
        throw new TypeError('coverageThreshold.global override must be a non-null object');
      }

      for (const [key, value] of Object.entries(customGlobal)) {
        if (!DEFAULT_COVERAGE_METRICS.includes(key)) {
          throw new RangeError(
            `Unknown coverage metric '${key}'. Supported metrics: ${DEFAULT_COVERAGE_METRICS.join(', ')}`
          );
        }
        mergedGlobalThresholds[key] = validateThreshold(value, key);
      }
    }
  }

  // Ensure all required metrics are validated
  for (const metric of DEFAULT_COVERAGE_METRICS) {
    validateThreshold(mergedGlobalThresholds[metric], metric);
  }

  const result = {
    preset,
    testEnvironment,
    roots,
    testMatch,
    collectCoverageFrom,
    coverageThreshold: {
      global: mergedGlobalThresholds,
    },
  };

  // Preserve any additional top-level overrides (e.g. transform, testTimeout, verbose, etc.)
  for (const [key, val] of Object.entries(overrides)) {
    if (!(key in result)) {
      result[key] = val;
    }
  }

  validateJestConfig(result);
  return result;
}

/**
 * Root export function. When Jest loads this file, it invokes this function and receives
 * a clean config object containing only valid Jest configuration options.
 *
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function getJestConfig(overrides = {}) {
  return createJestConfig(overrides);
}

// Attach default properties for backward compatibility with object consumers
getJestConfig.preset = DEFAULT_CONFIG.preset;
getJestConfig.testEnvironment = DEFAULT_CONFIG.testEnvironment;
getJestConfig.roots = [...DEFAULT_CONFIG.roots];
getJestConfig.testMatch = [...DEFAULT_CONFIG.testMatch];
getJestConfig.collectCoverageFrom = [...DEFAULT_CONFIG.collectCoverageFrom];
getJestConfig.coverageThreshold = {
  global: { ...DEFAULT_CONFIG.coverageThreshold.global },
};

// CJS & ESM interoperability
getJestConfig.default = getJestConfig;

// Export named factories, validators, and constants
getJestConfig.createJestConfig = createJestConfig;
getJestConfig.getJestConfig = getJestConfig;
getJestConfig.validateJestConfig = validateJestConfig;
getJestConfig.validateThreshold = validateThreshold;
getJestConfig.validateAndDeduplicateStringArray = validateAndDeduplicateStringArray;
getJestConfig.validateNonEmptyString = validateNonEmptyString;
getJestConfig.DEFAULT_CONFIG = DEFAULT_CONFIG;
getJestConfig.DEFAULT_COVERAGE_METRICS = DEFAULT_COVERAGE_METRICS;

module.exports = getJestConfig;
