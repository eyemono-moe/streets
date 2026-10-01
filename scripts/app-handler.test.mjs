import assert from "node:assert/strict";
import test from "node:test";
import { buildAppHandler, readHandler } from "./app-handler.mjs";
import { readKindInventory } from "./nip-support.mjs";

test("表示できる kind と、開ける URL の形を並べる", async () => {
  const event = buildAppHandler(await readHandler(), await readKindInventory());
  const values = (name) =>
    event.tags.filter((tag) => tag[0] === name).map((tag) => tag.slice(1));

  assert.equal(event.kind, 31990);
  assert.deepEqual(values("d"), [["streets"]]);
  assert.ok(values("k").some(([kind]) => kind === "1"));
  // 読み書きするだけの kind（フォローリストなど）は、開けると言わない。
  assert.ok(!values("k").some(([kind]) => kind === "3"));
  assert.deepEqual(values("web")[0], [
    "https://streets.eyemono.moe/<bech32>",
    "nevent",
  ]);
  assert.equal(JSON.parse(event.content).name, "Streets");
});
