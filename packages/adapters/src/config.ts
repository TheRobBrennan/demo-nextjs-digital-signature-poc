/**
 * Every endpoint, credential, and path comes from the environment. Nothing is
 * hardcoded - see `.env.example` for the full set.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env (or run \`make setup\`).`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export interface PostgresConfig {
  connectionString: string;
}

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export function postgresConfigFromEnv(): PostgresConfig {
  return { connectionString: required("DATABASE_URL") };
}

export function s3ConfigFromEnv(): S3Config {
  return {
    endpoint: required("S3_ENDPOINT"),
    region: optional("S3_REGION", "us-east-1"),
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    // MinIO serves buckets as a path segment, not a subdomain.
    forcePathStyle: optional("S3_FORCE_PATH_STYLE", "true") === "true",
  };
}

export function signingKeyPathFromEnv(): string {
  return optional("SIGNING_KEY_PATH", "./keys/signing-key.pem");
}
