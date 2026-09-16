import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { createRng, seedFromString, shuffle, pickOne } from "@/domain/random";

function take(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => rng());
}

describe("createRng", () => {
  test("is deterministic for a given seed", () => {
    assert.deepEqual(take(createRng(123), 5), take(createRng(123), 5));
  });

  test("produces different streams for different seeds", () => {
    assert.notDeepEqual(take(createRng(1), 5), take(createRng(2), 5));
  });

  test("emits values in [0, 1)", () => {
    const values = take(createRng(42), 1000);
    assert.ok(values.every((v) => v >= 0 && v < 1));
  });
});

describe("seedFromString", () => {
  test("is stable and case/content sensitive", () => {
    assert.equal(seedFromString("token-abc"), seedFromString("token-abc"));
    assert.notEqual(seedFromString("token-abc"), seedFromString("token-abd"));
  });

  test("returns an unsigned 32-bit integer", () => {
    const h = seedFromString("some-session-token");
    assert.ok(Number.isInteger(h));
    assert.ok(h >= 0 && h <= 0xffffffff);
  });
});

describe("shuffle", () => {
  test("is a permutation and does not mutate the input", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const frozen = [...input];
    const out = shuffle(input, createRng(7));
    assert.deepEqual(
      [...out].sort((a, b) => a - b),
      frozen,
    );
    assert.deepEqual(input, frozen);
  });

  test("is deterministic for a seeded rng", () => {
    const input = ["a", "b", "c", "d", "e"];
    assert.deepEqual(
      shuffle(input, createRng(9)),
      shuffle(input, createRng(9)),
    );
  });
});

describe("pickOne", () => {
  test("returns undefined for an empty list", () => {
    assert.equal(pickOne([], createRng(1)), undefined);
  });

  test("returns a member of the list", () => {
    const items = ["x", "y", "z"];
    assert.ok(items.includes(pickOne(items, createRng(3))!));
  });
});
