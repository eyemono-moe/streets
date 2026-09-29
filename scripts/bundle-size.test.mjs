import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkName, compare, initialFiles } from "./bundle-size.mjs";

test("ファイル名のハッシュを除いて突き合わせる", () => {
  assert.equal(chunkName("index-OaQoKUnL.js"), "index.js");
  assert.equal(
    chunkName("mutation-observer-BGd5KVRn.js"),
    "mutation-observer.js",
  );
  assert.equal(
    chunkName("_virtual_unicode-emojis-CUKODGyc.js"),
    "_virtual_unicode-emojis.js",
  );
  assert.equal(chunkName("index-C0klxWGR.css"), "index.css");
  assert.equal(
    chunkName("downscale.worker-D8fjXQX_.js"),
    "downscale.worker.js",
  );
});

test("index.html が最初に読むファイルを拾う", () => {
  const html = `
    <link rel="icon" href="/favicon.svg" />
    <script type="module" crossorigin src="/assets/index-OaQoKUnL.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/solid-B6tBqDUt.js">
    <link rel="stylesheet" crossorigin href="/assets/index-C0klxWGR.css">`;
  assert.deepEqual(
    [...initialFiles(html)],
    ["index-OaQoKUnL.js", "solid-B6tBqDUt.js", "index-C0klxWGR.css"],
  );
});

const chunks = (entries) => ({ chunks: Object.fromEntries(entries) });

test("起動時の量と全体の量の差を出し、揺れより小さい差は表に出さない", () => {
  const base = chunks([
    ["index.js", { bytes: 100_000, initial: true }],
    ["Settings.js", { bytes: 40_000, initial: false }],
    ["tiny.js", { bytes: 1_000, initial: false }],
  ]);
  const head = chunks([
    ["index.js", { bytes: 102_048, initial: true }],
    ["Settings.js", { bytes: 40_000, initial: false }],
    ["tiny.js", { bytes: 1_050, initial: false }],
    ["Hover.js", { bytes: 5_120, initial: false }],
  ]);
  const markdown = compare(base, head, "<!-- marker -->");
  assert.match(markdown, /^<!-- marker -->\n/);
  assert.match(
    markdown,
    /\| 起動時に読むもの \| 97\.7 KB \| 99\.7 KB \| \+2\.0 KB \(\+2\.0%\) \|/,
  );
  assert.match(
    markdown,
    /\| `index\.js` 🚀 \| 97\.7 KB \| 99\.7 KB \| \+2\.0 KB \|/,
  );
  assert.match(
    markdown,
    /\| `Hover\.js`（追加） \| 0\.0 KB \| 5\.0 KB \| \+5\.0 KB \|/,
  );
  assert.doesNotMatch(markdown, /Settings\.js|tiny\.js/);
  // 差の大きいものから並べる。
  assert.ok(markdown.indexOf("Hover.js") < markdown.indexOf("index.js`"));
});

test("変わったチャンクが無ければそう書く", () => {
  const same = chunks([["index.js", { bytes: 100_000, initial: true }]]);
  assert.match(
    compare(same, same),
    /100 バイト以上変わったチャンクはありません。/,
  );
  assert.match(compare(same, same), /\| ±0 \(\+0\.0%\) \|/);
});
