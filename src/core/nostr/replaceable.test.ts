import type { NostrEvent } from "nostr-tools";
import { describe, expect, test } from "vitest";
import {
  getReplaceableEventKey,
  isParameterizedReplaceableKind,
  isRegularReplaceableKind,
  shouldReplaceEvent,
} from "./replaceable";

const event = (
  overrides: Partial<NostrEvent> & { id: string },
): NostrEvent => ({
  id: overrides.id,
  pubkey: overrides.pubkey ?? "pubkey-a",
  created_at: overrides.created_at ?? 100,
  kind: overrides.kind ?? 1,
  tags: overrides.tags ?? [],
  content: overrides.content ?? "",
  sig: overrides.sig ?? `${overrides.id}-sig`,
});

describe("replaceable Nostr event helpers", () => {
  test("detects regular and parameterized replaceable kind ranges", () => {
    expect(isRegularReplaceableKind(0)).toBe(true);
    expect(isRegularReplaceableKind(3)).toBe(true);
    expect(isRegularReplaceableKind(10_000)).toBe(true);
    expect(isRegularReplaceableKind(19_999)).toBe(true);
    expect(isRegularReplaceableKind(1)).toBe(false);
    expect(isRegularReplaceableKind(30_000)).toBe(false);

    expect(isParameterizedReplaceableKind(30_000)).toBe(true);
    expect(isParameterizedReplaceableKind(39_999)).toBe(true);
    expect(isParameterizedReplaceableKind(0)).toBe(false);
    expect(isParameterizedReplaceableKind(40_000)).toBe(false);
  });

  test("builds stable replacement keys for replaceable events", () => {
    expect(
      getReplaceableEventKey(
        event({ id: "profile", kind: 0, pubkey: "alice" }),
      ),
    ).toEqual("0:alice");

    expect(
      getReplaceableEventKey(
        event({
          id: "article",
          kind: 30_023,
          pubkey: "alice",
          tags: [["d", "hello-world"]],
        }),
      ),
    ).toEqual("30023:alice:hello-world");

    expect(
      getReplaceableEventKey(event({ id: "note", kind: 1 })),
    ).toBeUndefined();
  });

  test("prefers newer replaceable events and uses id tie-breaker for deterministic equal timestamps", () => {
    const oldEvent = event({ id: "aaa", kind: 0, created_at: 100 });
    const newEvent = event({ id: "bbb", kind: 0, created_at: 200 });
    const sameTimeLowerId = event({ id: "aaa", kind: 0, created_at: 200 });
    const sameTimeHigherId = event({ id: "ccc", kind: 0, created_at: 200 });

    expect(shouldReplaceEvent(newEvent, oldEvent)).toBe(true);
    expect(shouldReplaceEvent(oldEvent, newEvent)).toBe(false);
    expect(shouldReplaceEvent(sameTimeHigherId, newEvent)).toBe(true);
    expect(shouldReplaceEvent(sameTimeLowerId, newEvent)).toBe(false);
  });
});
