import type { Pool } from "pg";

import type {
  DrawnSignature,
  SignatureRecord,
  SignatureRepository,
  SigningPayload,
} from "@sig/core";

interface Row {
  id: string;
  payload: SigningPayload;
  algorithm: string;
  public_key_id: string;
  signature: string;
  drawn_signature: DrawnSignature;
}

/**
 * `payload` and `drawn_signature` are stored as jsonb, which does not preserve
 * key order. That is safe here precisely because every hash is computed over
 * the canonical form (see `canonicalize` in core) rather than over whatever
 * JSON text happened to be stored - which is the reason canonicalization
 * exists in the first place.
 */
function toRecord(row: Row): SignatureRecord {
  return {
    id: row.id,
    payload: row.payload,
    algorithm: row.algorithm,
    publicKeyId: row.public_key_id,
    signature: row.signature,
    drawnSignature: row.drawn_signature,
  };
}

export class PostgresSignatureRepository implements SignatureRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async save(record: SignatureRecord): Promise<void> {
    await this.#pool.query(
      `insert into signatures
         (id, document_id, payload, algorithm, public_key_id, signature, drawn_signature)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         payload = excluded.payload,
         algorithm = excluded.algorithm,
         public_key_id = excluded.public_key_id,
         signature = excluded.signature,
         drawn_signature = excluded.drawn_signature`,
      [
        record.id,
        record.payload.documentId,
        JSON.stringify(record.payload),
        record.algorithm,
        record.publicKeyId,
        record.signature,
        JSON.stringify(record.drawnSignature),
      ],
    );
  }

  async get(id: string): Promise<SignatureRecord | null> {
    const result = await this.#pool.query<Row>(
      `select id, payload, algorithm, public_key_id, signature, drawn_signature
         from signatures where id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  async listForDocument(documentId: string): Promise<SignatureRecord[]> {
    const result = await this.#pool.query<Row>(
      `select id, payload, algorithm, public_key_id, signature, drawn_signature
         from signatures where document_id = $1 order by created_at, id`,
      [documentId],
    );
    return result.rows.map(toRecord);
  }
}
