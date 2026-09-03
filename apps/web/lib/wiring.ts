import "server-only";

import { wireFromEnv, type Wiring } from "@sig/adapters";

/**
 * One wiring per process. Next hot-reloads modules in dev, which would
 * otherwise open a new Postgres pool on every edit until the database refuses
 * connections.
 */
const globalForWiring = globalThis as unknown as {
  __sigWiring?: Promise<Wiring>;
};

export function getWiring(): Promise<Wiring> {
  globalForWiring.__sigWiring ??= wireFromEnv();
  return globalForWiring.__sigWiring;
}
