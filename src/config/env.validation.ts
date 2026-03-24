export type EnvironmentVariables = {
  APP_PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;
};

function readString(
  config: Record<string, unknown>,
  key: string,
  fallback?: string,
): string {
  const value = config[key];

  if (typeof value === 'string') {
    const trimmedValue = value.trim();

    if (trimmedValue.length > 0) {
      return trimmedValue;
    }
  }

  if (typeof fallback === 'string') {
    return fallback;
  }

  throw new Error(`Environment variable "${key}" is required`);
}

function readPort(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = config[key];

  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value > 0 && value <= 65535) {
      return value;
    }
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedValue = Number(value);

    if (
      Number.isInteger(parsedValue) &&
      parsedValue > 0 &&
      parsedValue <= 65535
    ) {
      return parsedValue;
    }

    throw new Error(
      `Environment variable "${key}" must be a valid port number`,
    );
  }

  return fallback;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  return {
    APP_PORT: readPort(config, 'APP_PORT', 3000),
    DB_HOST: readString(config, 'DB_HOST', 'localhost'),
    DB_PORT: readPort(config, 'DB_PORT', 5432),
    DB_USERNAME: readString(config, 'DB_USERNAME', 'postgres'),
    DB_PASSWORD: readString(config, 'DB_PASSWORD', 'postgres'),
    DB_NAME: readString(config, 'DB_NAME', 'grove'),
  };
}

export function getValidatedEnv(
  config: Record<string, unknown> = process.env,
): EnvironmentVariables {
  return validateEnv(config);
}
