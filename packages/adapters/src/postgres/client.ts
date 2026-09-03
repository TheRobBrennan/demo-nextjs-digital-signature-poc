import { Pool } from "pg";

import type { PostgresConfig } from "../config.ts";

/**
 * Schema is applied on demand rather than through a migration tool. For a
 * spike with two tables that is the right amount of machinery; a real service
 * would want versioned migrations before the second developer shows up.
 */
const SCHEMA = `
create table if not exists signatures (
  id             text primary key,
  document_id    text not null,
  payload        jsonb not null,
  algorithm      text not null,
  public_key_id  text not null,
  signature      text not null,
  drawn_signature jsonb not null,
  created_at     timestamptz not null default now()
);

create index if not exists signatures_document_id_idx
  on signatures (document_id);

create table if not exists audit_events (
  seq       bigint primary key,
  id        text not null unique,
  type      text not null,
  -- Deliberately text, not timestamptz. The timestamp is part of the hashed
  -- content, so it has to come back byte-identical to what was signed; a
  -- timestamptz round trip can renormalize precision and silently break every
  -- hash in the chain.
  at        text not null,
  actor     text not null,
  data      jsonb not null,
  prev_hash text not null,
  hash      text not null
);
`;

export async function createPool(config: PostgresConfig): Promise<Pool> {
  const pool = new Pool({ connectionString: config.connectionString });
  return pool;
}

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA);
}

/** Waits for Postgres to accept queries. Compose health checks lie sometimes. */
export async function waitForPostgres(
  pool: Pool,
  { attempts = 30, delayMs = 500 } = {},
): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `Postgres did not become ready after ${attempts} attempts: ${String(lastError)}`,
  );
}
