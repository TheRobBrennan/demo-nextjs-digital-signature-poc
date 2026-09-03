/**
 * Every endpoint, credential, and path comes from the environment. Nothing is
 * hardcoded - see `.env.example` for the full set.
 */
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

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
    // Deployment target is us-west-2 (Oregon); MinIO ignores it locally.
    region: optional("S3_REGION", "us-west-2"),
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    // MinIO serves buckets as a path segment, not a subdomain.
    forcePathStyle: optional("S3_FORCE_PATH_STYLE", "true") === "true",
  };
}

/**
 * Walks up from the current directory to the workspace root, identified by
 * `pnpm-workspace.yaml`.
 *
 * This matters because processes in this repo start from different places:
 * the CLI scripts run from the repo root, but `next dev` runs with its cwd set
 * to `apps/web`. A relative key path therefore resolved to two different files,
 * and the web app quietly minted its own signing key - so everything signed on
 * the command line came back INVALID_SIGNATURE in the browser, which reads
 * exactly like a forgery. Anchoring to the workspace root makes the path mean
 * the same thing to every process.
 */
function workspaceRoot(): string {
  let directory = process.cwd();
  for (;;) {
    if (existsSync(resolve(directory, "pnpm-workspace.yaml"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return process.cwd();
    directory = parent;
  }
}

export function signingKeyPathFromEnv(): string {
  const configured = optional("SIGNING_KEY_PATH", "./keys/signing-key.pem");
  return isAbsolute(configured)
    ? configured
    : resolve(workspaceRoot(), configured);
}
