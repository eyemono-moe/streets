import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFile, checkImport, coreRelative } from "./read-layers.mjs";

test("下の段への import は通る", () => {
  assert.equal(
    checkImport("read/subscription-manager.ts", "./read-planner"),
    undefined,
  );
  assert.equal(checkImport("read/relay-session.ts", "./scheduler"), undefined);
});

test("上の段への import は落ちる", () => {
  assert.match(
    checkImport("read/relay-session.ts", "./subscription-manager"),
    /pool の段.*ledger の段/,
  );
});

test("relay/ はどの段からも読め、外へは nostr/ と signer/ だけ出られる", () => {
  assert.equal(
    checkImport("read/connection-pool.ts", "../relay/relay-connection"),
    undefined,
  );
  assert.equal(checkImport("read/event-store.ts", "../nostr/event"), undefined);
  assert.match(
    checkImport("read/event-store.ts", "../deck/deck"),
    /読み取り層の外/,
  );
});

test("段の決まっていないファイルは落ちる。テストは見ない", () => {
  assert.match(checkFile("read/new-thing.ts"), /段が決まっていない/);
  assert.equal(checkFile("read/new-thing.test.ts"), undefined);
  assert.equal(checkFile("deck/deck.ts"), undefined);
});

test("core の外のファイルは見ない", () => {
  assert.equal(coreRelative("/repo/apps/web/src/App.tsx"), undefined);
  assert.equal(
    coreRelative("/repo/packages/core/src/read/read-layer.ts"),
    "read/read-layer.ts",
  );
});
