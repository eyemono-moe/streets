import assert from "node:assert/strict";
import test from "node:test";
import { kindReferences } from "./kind-refs.mjs";
import {
  impactedNips,
  nipIdFromPath,
  renderImpactReport,
} from "./nip-tracking.mjs";

test("NIP 本文だけを候補にし、未記載の NIP も残す", () => {
  assert.equal(nipIdFromPath("65.md"), "65");
  assert.equal(nipIdFromPath("README.md"), undefined);
  assert.equal(nipIdFromPath("docs/65.md"), undefined);
  const items = impactedNips(
    ["65.md", "65.md", "A3.md", "README.md"],
    [
      {
        nip: "65",
        status: "対応",
        summary: "リレー",
        kinds: [10002],
        tags: ["r"],
        paths: ["read/relay-list.ts"],
        gap: "",
      },
    ],
    [{ kind: 10002, status: "内部利用" }],
  );
  assert.deepEqual(
    items.map((item) => [item.nip, item.status]),
    [
      ["65", "対応"],
      ["A3", "未記載"],
    ],
  );
});

test("影響レポートに kind・タグ・実装候補と比較リンクを載せる", () => {
  const report = renderImpactReport({
    base: "a".repeat(40),
    head: "b".repeat(40),
    changed: [
      {
        nip: "65",
        status: "対応",
        summary: "リレー",
        kinds: [{ kind: 10002, status: "内部利用" }],
        tags: ["r"],
        paths: ["read/relay-list.ts"],
        kindPaths: [
          {
            kind: 10002,
            paths: ["packages/core/src/read/bootstrap.ts"],
          },
        ],
        gap: "",
      },
    ],
  });
  assert.match(report, /kind: 10002/);
  assert.match(report, /タグ: r/);
  assert.match(report, /read\/relay-list\.ts/);
  assert.match(report, /主な実装（対応表に手動で記録）/);
  assert.match(report, /kind の直接参照（静的検出/);
  assert.match(report, /packages\/core\/src\/read\/bootstrap\.ts/);
  assert.match(report, /github\.com\/nostr-protocol\/nips\/compare/);
});

test("kind 定数の import と直接の数値参照から候補ファイルを拾う", async () => {
  const references = await kindReferences();
  assert.ok(references.get(42)?.includes("packages/core/src/nostr/channel.ts"));
  assert.ok(
    references.get(42)?.includes("packages/core/src/deck/column-sources.ts"),
  );
  assert.ok(references.get(42)?.includes("apps/web/src/note/Event.tsx"));
  assert.ok(
    references.get(10002)?.includes("apps/web/src/settings/RelayMediator.tsx"),
  );
  assert.ok(
    references.get(10002)?.includes("packages/core/src/read/bootstrap.ts"),
  );
});
