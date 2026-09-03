import { describe, expect, it } from "vitest";

import { canonicalize, hashDrawnSignature, sha256, sha256Utf8 } from "../src/hash";
import { A_SIGNATURE } from "./support";
import type { DrawnSignature } from "../src/model";

describe("canonicalize", () => {
  it("is independent of key order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("sorts keys at every depth", () => {
    expect(canonicalize({ z: { y: 1, x: 2 }, a: 3 })).toBe(
      '{"a":3,"z":{"x":2,"y":1}}',
    );
  });

  it("preserves array order, which is meaningful", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("omits undefined members so they cannot silently change a hash", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("sha256", () => {
  it("matches the known digest for a known input", () => {
    expect(sha256Utf8("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("changes when a single byte changes", () => {
    expect(sha256(new Uint8Array([1, 2, 3]))).not.toBe(
      sha256(new Uint8Array([1, 2, 4])),
    );
  });
});

describe("hashDrawnSignature", () => {
  it("is stable across calls", () => {
    expect(hashDrawnSignature(A_SIGNATURE)).toBe(
      hashDrawnSignature(structuredClone(A_SIGNATURE)),
    );
  });

  it("ignores float noise below the pinned precision", () => {
    const noisy: DrawnSignature = {
      ...A_SIGNATURE,
      strokes: A_SIGNATURE.strokes.map((stroke) =>
        stroke.map((point) => ({
          x: point.x + 0.00001,
          y: point.y - 0.00001,
        })),
      ),
    };
    expect(hashDrawnSignature(noisy)).toBe(hashDrawnSignature(A_SIGNATURE));
  });

  it("changes when a stroke actually moves", () => {
    const moved: DrawnSignature = {
      ...A_SIGNATURE,
      strokes: [[{ x: 0, y: 0 }], ...A_SIGNATURE.strokes.slice(1)],
    };
    expect(hashDrawnSignature(moved)).not.toBe(hashDrawnSignature(A_SIGNATURE));
  });

  it("distinguishes one long stroke from two short ones", () => {
    const joined: DrawnSignature = {
      ...A_SIGNATURE,
      strokes: [A_SIGNATURE.strokes.flat()],
    };
    expect(hashDrawnSignature(joined)).not.toBe(hashDrawnSignature(A_SIGNATURE));
  });
});
