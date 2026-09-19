import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertLocalRelayUrl,
  createPastTimestampSequence,
  relayListTemplate,
} from "./seed-dev-fixtures.mjs";

describe("seed-dev fixtures", () => {
  it("loopback のリレーだけを許可する", () => {
    assert.equal(
      assertLocalRelayUrl("ws://127.0.0.1:8080"),
      "ws://127.0.0.1:8080",
    );
    assert.equal(
      assertLocalRelayUrl("ws://localhost:8080"),
      "ws://localhost:8080",
    );
    assert.throws(
      () => assertLocalRelayUrl("wss://relay.example.com"),
      /ローカルリレー以外へは seed できません/,
    );
  });

  it("リレーリストはローカルリレーを read/write 両用にする", () => {
    assert.deepEqual(relayListTemplate("ws://127.0.0.1:8080", 123), {
      kind: 10002,
      created_at: 123,
      tags: [["r", "ws://127.0.0.1:8080"]],
      content: "",
    });
  });

  it("イベント数が増えても created_at が現在より先へ進まない", () => {
    const now = 1_000;
    const nextCreatedAt = createPastTimestampSequence(now, 2);
    assert.deepEqual(
      Array.from({ length: 5 }, () => nextCreatedAt()),
      [998, 999, 1000, 1000, 1000],
    );
  });
});
