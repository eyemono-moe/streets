import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type CDPSession, type Page, chromium } from "@playwright/test";
import { buildColumn } from "@streets/core/deck/column-presets";
import {
  type ColumnDef,
  type DeckSet,
  FIRST_DECK_ID,
  FIRST_DECK_NAME,
  deckStorageKey,
  saveDeckSet,
} from "@streets/core/deck/deck";
import { decodeUserInput } from "@streets/core/nostr/nip19";
import {
  TOUR_STORAGE_KEY,
  saveTourSeen,
} from "@streets/core/settings/tour-setting";
import {
  LOGIN_METHOD_STORAGE_KEY,
  saveLoginMethod,
} from "@streets/core/signer/session-storage";
import { type Allocators, rendererAllocators } from "./allocators";
import { type HeapSummary, summarizeHeapSnapshot } from "./heap-summary";
import { type ProcessMemory, processMemory } from "./processes";

const USAGE = `使い方:
  vp run memory --pubkey <hex か npub> [--users <hex か npub>,<hex か npub>] [--app-url <URL>]
                [--columns 6|10]
                [--minutes 10] [--interval 30] [--settle 60] [--no-reload] [--headed]

本番ビルドを開き、6 または 10 カラムでメモリを計る。
先に別の端末で vp run build と vp run @streets/web#preview を立てておく。
結果は tools/memory/.out/<日時>/ に書く。`;

/** --users を省いたときの 2 人。投稿も反応も多い、よく知られた公開アカウント。 */
const DEFAULT_USERS = [
  // jack
  "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2",
  // fiatjaf
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
];

const { values } = parseArgs({
  options: {
    pubkey: { type: "string" },
    users: { type: "string" },
    columns: { type: "string", default: "6" },
    "app-url": { type: "string", default: "http://localhost:4173" },
    minutes: { type: "string", default: "10" },
    interval: { type: "string", default: "30" },
    settle: { type: "string", default: "60" },
    "no-reload": { type: "boolean", default: false },
    "no-snapshot": { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

const pubkey = values.pubkey ? decodeUserInput(values.pubkey) : undefined;
const userInputs = values.users?.split(",") ?? DEFAULT_USERS;
const users = userInputs.flatMap((user) => decodeUserInput(user) ?? []);
if (
  values.help ||
  !pubkey ||
  userInputs.length !== 2 ||
  users.length !== 2 ||
  !["6", "10"].includes(values.columns)
) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const minutes = Number(values.minutes);
const intervalSec = Number(values.interval);
const settleSec = Number(values.settle);

const column = (
  kind: Parameters<typeof buildColumn>[0],
  input = "",
): ColumnDef => {
  const built = buildColumn(kind, input);
  if (!built) throw new Error(`カラムを作れません: ${kind} ${input}`);
  return built;
};

const deck: DeckSet = {
  version: 3,
  decks: [
    {
      id: FIRST_DECK_ID,
      name: FIRST_DECK_NAME,
      columns: [
        column("home"),
        column("notifications"),
        column("user", pubkey),
        {
          id: crypto.randomUUID(),
          title: "自分のリアクション",
          source: {
            kind: "literal",
            filters: [{ kinds: [7], authors: [pubkey] }],
          },
        },
        column("user", users[0]),
        column("user", users[1]),
        ...(values.columns === "10"
          ? [
              column("hashtag", "nostr"),
              column("hashtag", "bitcoin"),
              column("hashtag", "art"),
              column("hashtag", "photography"),
            ]
          : []),
      ],
    },
  ],
};

type Sample = {
  phase: string;
  seconds: number;
  jsHeapUsed: number;
  jsHeapTotal: number;
  domNodes: number;
  listeners: number;
  images: {
    count: number;
    decodedBytes: number;
    oversizedBytes: number;
    resizedBytes: number;
  };
  storageUsage: number;
  processes: ProcessMemory;
  allocators: Allocators;
};

const OUT_DIR = fileURLToPath(
  new URL(
    `../.out/${new Date().toISOString().replaceAll(":", "-")}/`,
    import.meta.url,
  ),
);
mkdirSync(OUT_DIR, { recursive: true });

const server = await chromium.launchServer({ headless: !values.headed });
// Playwright が立てたブラウザのプロセス。pid が無いのは起動に失敗したときだけ。
const browserPid = server.process().pid ?? 0;
const browser = await chromium.connect(server.wsEndpoint());
const context = await browser.newContext({
  viewport: { width: 2400, height: 1200 },
});

// 公開鍵だけを返す NIP-07 の代わり。署名も暗号化もできないので、計測の間に
// この人の名前で何かが書かれることはない（デッキの同期などは失敗して終わる）。
const storage = {
  [LOGIN_METHOD_STORAGE_KEY]: saveLoginMethod("nip07"),
  [TOUR_STORAGE_KEY]: saveTourSeen(),
  [deckStorageKey(pubkey)]: JSON.stringify({
    cacheVersion: 1,
    serialized: saveDeckSet(deck),
    dirty: false,
  }),
};
// 関数ではなく文字列で渡す。tsx は関数に `__name(...)` を書き足すので、関数の
// ソースをページへ送ると ReferenceError で止まり、ログインもしないまま計ってしまう。
await context.addInitScript({
  content: `
    for (const [key, value] of Object.entries(${JSON.stringify(storage)})) {
      localStorage.setItem(key, value);
    }
    window.nostr = {
      getPublicKey: async () => ${JSON.stringify(pubkey)},
      signEvent: async () => {
        throw new Error("計測用の署名器は署名しません");
      },
    };
  `,
});

const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const browserSession = await browser.newBrowserCDPSession();
await cdp.send("Performance.enable");
await cdp.send("HeapProfiler.enable");

let snapshotStream: ReturnType<typeof createWriteStream> | undefined;
cdp.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) =>
  snapshotStream?.write(chunk),
);

const takeSnapshot = async (name: string): Promise<HeapSummary> => {
  const file = join(OUT_DIR, `${name}.heapsnapshot`);
  const stream = createWriteStream(file);
  snapshotStream = stream;
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  snapshotStream = undefined;
  await new Promise((resolve) => stream.end(resolve));
  console.log(`  ヒープスナップショット: ${file}`);
  return summarizeHeapSnapshot(readFileSync(file));
};

const metric = (
  metrics: Array<{ name: string; value: number }>,
  name: string,
) => metrics.find((entry) => entry.name === name)?.value ?? 0;

const measure = async (
  session: CDPSession,
  target: Page,
  phase: string,
  seconds: number,
): Promise<Sample> => {
  await session.send("HeapProfiler.collectGarbage");
  const { metrics } = await session.send("Performance.getMetrics");
  const pageSide = await target.evaluate(async () => {
    const dpr = window.devicePixelRatio;
    let count = 0;
    let decodedBytes = 0;
    let oversizedBytes = 0;
    let resizedBytes = 0;
    for (const image of document.images) {
      if (!image.complete || image.naturalWidth === 0) continue;
      count++;
      const bytes = image.naturalWidth * image.naturalHeight * 4;
      decodedBytes += bytes;
      const shown = image.clientWidth * image.clientHeight * dpr * dpr;
      // 表示の 4 倍より多い画素を読んでいるものは、縮小せずに読み込んでいる。
      if (shown > 0 && bytes > shown * 4 * 4) oversizedBytes += bytes;
      // Worker が縮小して配ったもの（アイコン）。失敗して元の画像へ戻ったものは入らない。
      if (new URL(image.currentSrc).pathname === "/api/image") {
        resizedBytes += bytes;
      }
    }
    const estimate = await navigator.storage.estimate();
    return {
      images: { count, decodedBytes, oversizedBytes, resizedBytes },
      storageUsage: estimate.usage ?? 0,
    };
  });
  const sample: Sample = {
    phase,
    seconds,
    jsHeapUsed: metric(metrics, "JSHeapUsedSize"),
    jsHeapTotal: metric(metrics, "JSHeapTotalSize"),
    domNodes: metric(metrics, "Nodes"),
    listeners: metric(metrics, "JSEventListeners"),
    ...pageSide,
    processes: processMemory(browserPid),
    allocators: await rendererAllocators(browserSession),
  };
  console.log(
    `  [${phase} ${seconds}s] JS ${mb(sample.jsHeapUsed)} / DOM ${sample.domNodes} / renderer ${mb(sample.processes.renderer ?? 0)}`,
  );
  return sample;
};

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const wait = (seconds: number) =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const samples: Sample[] = [];
const snapshots: Array<{ name: string; summary: HeapSummary }> = [];

console.log(`${values["app-url"]} を開きます（結果: ${OUT_DIR}）`);
await page.goto(values["app-url"]);
await wait(settleSec);
// カラムが読み込めているか（ログインできたか）を後から確かめる。
await page.screenshot({ path: join(OUT_DIR, "start.png") });
samples.push(await measure(cdp, page, "起動", settleSec));
if (!values["no-snapshot"]) {
  snapshots.push({ name: "起動直後", summary: await takeSnapshot("start") });
}

const endSec = minutes * 60;
for (
  let seconds = settleSec + intervalSec;
  seconds <= endSec;
  seconds += intervalSec
) {
  await wait(intervalSec);
  samples.push(await measure(cdp, page, "経過", seconds));
}
if (!values["no-snapshot"]) {
  snapshots.push({
    name: `${minutes} 分後`,
    summary: await takeSnapshot("end"),
  });
}

if (!values["no-reload"]) {
  // IndexedDB に溜まったキャッシュを起動時に読み込む分を見る。
  await page.reload();
  await wait(settleSec);
  samples.push(await measure(cdp, page, "再読み込み", settleSec));
  snapshots.push({
    name: "再読み込み後",
    summary: await takeSnapshot("reload"),
  });
}

await browser.close();
await server.close();

const table = (header: string[], rows: string[][]) =>
  [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

const processTypes = [
  ...new Set(samples.flatMap((sample) => Object.keys(sample.processes))),
].sort();

// 表の列は、どこかの時点で 10 MB を超えたアロケータだけにする。
const allocatorNames = [
  ...new Set(samples.flatMap((sample) => Object.keys(sample.allocators))),
]
  .filter((name) =>
    samples.some((sample) => (sample.allocators[name] ?? 0) > 10 * 1024 * 1024),
  )
  .sort();

const report = [
  `# メモリの計測（${new Date().toISOString()}）`,
  "",
  `- アプリ: ${values["app-url"]}`,
  `- カラム: ${deck.decks.flatMap((d) => d.columns.map((c) => c.title)).join("・")}`,
  "",
  "## 推移",
  "",
  "JS ヒープは計る前に GC してからの値。画像は、読み込み済みの `<img>` の画素数 × 4 バイトで見積もった上限（画面の外で捨てられた分も含む）。プロセスは PSS。",
  "",
  table(
    [
      "段",
      "秒",
      "JS ヒープ",
      "DOM ノード",
      "リスナー",
      "画像（枚）",
      "画像（見積もり）",
      "うち縮小なし",
      "うち /api/image",
      "IndexedDB など",
      ...processTypes,
    ],
    samples.map((sample) => [
      sample.phase,
      String(sample.seconds),
      mb(sample.jsHeapUsed),
      String(sample.domNodes),
      String(sample.listeners),
      String(sample.images.count),
      mb(sample.images.decodedBytes),
      mb(sample.images.oversizedBytes),
      mb(sample.images.resizedBytes),
      mb(sample.storageUsage),
      ...processTypes.map((type) => mb(sample.processes[type] ?? 0)),
    ]),
  ),
  "",
  "## renderer の内訳",
  "",
  "Chrome の memory-infra が数えた、renderer のアロケータごとの大きさ（10 MB を超えたことがあるものだけ）。`a/b` は `a` の内訳。`cc/image_memory` がデコード済みの画像、`cc/tile_memory` が描いたタイル、`v8` が JS、`blink_gc` が DOM などの Blink のオブジェクト。`discardable` と `shared_memory` は、デコード済みの画像などの置き場で、`cc/image_memory` と同じメモリを数え直している。足し合わせない。",
  "",
  table(
    ["段", "秒", ...allocatorNames],
    samples.map((sample) => [
      sample.phase,
      String(sample.seconds),
      ...allocatorNames.map((name) => mb(sample.allocators[name] ?? 0)),
    ]),
  ),
  "",
  ...snapshots.flatMap(({ name, summary }) => [
    `## ヒープ: ${name}`,
    "",
    `合計 ${mb(summary.totalSize)}・ノード ${summary.nodeCount}・Nostr のイベントらしいオブジェクト ${summary.nostrEvents} 個・ページから外れた DOM ${summary.detachedNodes} 個`,
    "",
    table(
      ["種類", "合計", "個数"],
      summary.byType
        .slice(0, 10)
        .map((group) => [group.type, mb(group.size), String(group.count)]),
    ),
    "",
    table(
      ["種類", "名前", "合計", "個数"],
      summary.top.map((group) => [
        group.type,
        `\`${group.name.slice(0, 60).replaceAll("|", "\\|")}\``,
        mb(group.size),
        String(group.count),
      ]),
    ),
    "",
  ]),
].join("\n");

writeFileSync(join(OUT_DIR, "report.md"), report);
writeFileSync(
  join(OUT_DIR, "samples.json"),
  JSON.stringify({ samples, snapshots }, null, 2),
);
console.log(`\n${join(OUT_DIR, "report.md")} に書きました。`);
