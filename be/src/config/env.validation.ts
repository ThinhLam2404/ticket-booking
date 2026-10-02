import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV = 'development';

  @IsNotEmpty()
  @IsString()
  DATABASE_URL!: string;

  @IsNotEmpty()
  @IsUrl({ protocols: ['redis'], require_tld: false })
  REDIS_URL!: string;

  @IsNotEmpty()
  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsNotEmpty()
  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  TMDB_ACCESS_TOKEN?: string;

  @IsOptional()
  @IsString()
  SEPAY_BANK_CODE?: string;

  @IsOptional()
  @IsString()
  SEPAY_ACCOUNT_NUMBER?: string;

  @IsOptional()
  @IsString()
  SEPAY_ACCOUNT_NAME?: string;

  @IsOptional()
  @IsString()
  SEPAY_WEBHOOK_API_KEY?: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_EXPIRES_IN = '15m';

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN = '7d';

  @IsOptional()
  @IsString()
  SMTP_HOST = 'smtp.example.com';

  @IsOptional()
  SMTP_PORT = '587';

  @IsOptional()
  @IsString()
  SMTP_SECURE = 'false';

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  SMTP_FROM = 'CineBook <no-reply@example.com>';

  @IsOptional()
  @IsUrl({ require_tld: false })
  PUBLIC_APP_URL = 'http://localhost:5173';

  @IsOptional()
  @IsIn(['true', 'false'])
  MAIL_WORKER_ENABLED?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED?: string;

  @IsOptional()
  @Matches(/^(true|false|[0-9]+)$/)
  TRUST_PROXY = 'false';

  @IsOptional()
  @IsString()
  REQUEST_BODY_LIMIT = '256kb';

  @IsOptional()
  @IsString()
  REFRESH_TOKEN_RETENTION_DAYS = '30';

  @IsOptional()
  @IsString()
  VERIFICATION_TOKEN_RETENTION_DAYS = '2';

  @IsOptional()
  @IsString()
  MAIL_OUTBOX_RETENTION_DAYS = '90';

  @IsOptional()
  @IsString()
  MAIL_WORKER_POLL_MS = '10000';

  @IsOptional()
  @IsString()
  MAIL_WORKER_STALE_LOCK_MS = '300000';

  @IsOptional()
  @IsString()
  MAIL_WORKER_SHUTDOWN_TIMEOUT_MS = '15000';
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length) {
    throw new Error(
      `Invalid environment configuration: ${errors
        .flatMap((error) => Object.values(error.constraints ?? {}))
        .join(', ')}`,
    );
  }

  if (validated.JWT_ACCESS_SECRET === validated.JWT_REFRESH_SECRET) {
    throw new Error('JWT access and refresh secrets must be different');
  }

  if (
    validated.NODE_ENV === 'production' &&
    (validated.JWT_ACCESS_SECRET.length < 32 ||
      validated.JWT_REFRESH_SECRET.length < 32)
  ) {
    throw new Error('JWT secrets must be at least 32 characters in production');
  }

  if (
    validated.NODE_ENV === 'production' &&
    [validated.JWT_ACCESS_SECRET, validated.JWT_REFRESH_SECRET].some((secret) =>
      /(?:change[-_ ]?me|example|replace[-_ ]?with|your[-_ ]|local[-_ ]|password)/i.test(
        secret,
      ),
    )
  ) {
    throw new Error('JWT secrets must not use example or placeholder values in production');
  }

  if (validated.NODE_ENV === 'production') {
    const requiredProductionValues = [
      ['SEPAY_WEBHOOK_API_KEY', validated.SEPAY_WEBHOOK_API_KEY],
      ['CORS_ORIGINS', validated.CORS_ORIGINS],
    ] as const;
    const missing = requiredProductionValues
      .filter(([, value]) => !value?.trim())
      .map(([key]) => key);
    if (missing.length) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
  }

  return validated;
}
