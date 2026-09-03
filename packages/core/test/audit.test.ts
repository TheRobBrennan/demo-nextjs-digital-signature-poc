import { describe, expect, it } from "vitest";

import { GENESIS_PREV_HASH, verifyAuditChain } from "../src/audit";
import { InMemoryAuditLog } from "../src/testkit";
import type { AuditEvent } from "../src/model";

async function makeChain(length: number): Promise<InMemoryAuditLog> {
  const log = new InMemoryAuditLog();
  for (let i = 0; i < length; i++) {
    await log.append({
      type: "document.viewed",
      at: new Date(Date.UTC(2026, 8, 3, 19, 0, i)).toISOString(),
      actor: "rob@sploosh.ai",
      data: { i },
    });
  }
  return log;
}

describe("verifyAuditChain", () => {
  it("accepts an empty log", () => {
    expect(verifyAuditChain([])).toEqual({ ok: true, length: 0 });
  });

  it("anchors the first event to the genesis hash", async () => {
    const log = await makeChain(1);
    expect((await log.list())[0]!.prevHash).toBe(GENESIS_PREV_HASH);
  });

  it("accepts an untouched chain", async () => {
    const log = await makeChain(5);
    expect(verifyAuditChain(await log.list())).toEqual({ ok: true, length: 5 });
  });

  it("names the event whose content was edited", async () => {
    const log = await makeChain(5);
    log.rewriteEvent(3, { actor: "mallory@example.com" });
    expect(verifyAuditChain(await log.list())).toEqual({
      ok: false,
      brokenAt: 3,
      reason: "content-hash-mismatch",
    });
  });

  it("catches an edit even when the hash is recomputed to match", async () => {
    // A tamperer who understands the scheme fixes the event's own hash. The
    // chain still breaks, because the NEXT event's prevHash no longer agrees -
    // covering up properly would mean rewriting every event after it too.
    const log = await makeChain(5);
    const events = await log.list();
    const target = events[2]!;
    const edited: AuditEvent = { ...target, actor: "mallory@example.com" };
    const { hashAuditEvent } = await import("../src/audit");
    log.rewriteEvent(3, {
      ...edited,
      hash: hashAuditEvent(edited),
    });

    expect(verifyAuditChain(await log.list())).toEqual({
      ok: false,
      brokenAt: 4,
      reason: "prev-hash-mismatch",
    });
  });

  it("catches a deleted event as a gap", async () => {
    const log = await makeChain(5);
    log.deleteEvent(3);
    expect(verifyAuditChain(await log.list())).toEqual({
      ok: false,
      brokenAt: 4,
      reason: "sequence-gap",
    });
  });

  it("reports the first break, not the last", async () => {
    const log = await makeChain(6);
    log.rewriteEvent(2, { actor: "mallory@example.com" });
    log.rewriteEvent(5, { actor: "mallory@example.com" });
    expect(verifyAuditChain(await log.list())).toMatchObject({
      ok: false,
      brokenAt: 2,
    });
  });
});
