import type { Pool } from "pg";

import { linkAuditEvent } from "@sig/core";
import type { AuditEvent, AuditLog, NewAuditEvent } from "@sig/core";
import { randomUUID } from "node:crypto";

interface Row {
  seq: string;
  id: string;
  type: AuditEvent["type"];
  at: string;
  actor: string;
  data: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

function toEvent(row: Row): AuditEvent {
  return {
    seq: Number(row.seq),
    id: row.id,
    type: row.type,
    at: row.at,
    actor: row.actor,
    data: row.data,
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}

export class PostgresAuditLog implements AuditLog {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  /**
   * Appending requires reading the current tail and writing the next link, and
   * two concurrent appends that both read the same tail would fork the chain.
   * The table lock serializes them. It is a blunt instrument that would not
   * survive real write volume - the production answer is an identity column
   * plus a chain computed on read, or a single-writer outbox - but it is
   * correct, and correctness is the property this table is selling.
   */
  async append(event: NewAuditEvent): Promise<AuditEvent> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query("lock table audit_events in exclusive mode");

      const tail = await client.query<Row>(
        `select seq, id, type, at, actor, data, prev_hash, hash
           from audit_events order by seq desc limit 1`,
      );
      const previousRow = tail.rows[0];
      const linked = linkAuditEvent({
        event,
        id: randomUUID(),
        previous: previousRow ? toEvent(previousRow) : null,
      });

      await client.query(
        `insert into audit_events (seq, id, type, at, actor, data, prev_hash, hash)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          linked.seq,
          linked.id,
          linked.type,
          linked.at,
          linked.actor,
          JSON.stringify(linked.data),
          linked.prevHash,
          linked.hash,
        ],
      );

      await client.query("commit");
      return linked;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(): Promise<AuditEvent[]> {
    const result = await this.#pool.query<Row>(
      `select seq, id, type, at, actor, data, prev_hash, hash
         from audit_events order by seq`,
    );
    return result.rows.map(toEvent);
  }
}
