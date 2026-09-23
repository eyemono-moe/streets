import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import { createAssetReader, serveAssets } from "./assets";
import { generate } from "./generate";
import { pubkeyFor, secretKeyFor } from "./keys";
import { type ScenarioName, scenarios } from "./scenarios";
import { parseBaseTime } from "./time";

const USAGE = `使い方:
  pnpm screenshot [シナリオ] [--time <日時>]        リレー・画像・署名器を立てる（Ctrl+C で止める）
  pnpm screenshot:seed [シナリオ] [--time <日時>]   立っているリレーへ投入し直す
  pnpm screenshot:generate [シナリオ] [--time <日時>] イベントを JSONL に書き出すだけ

シナリオ: ${Object.keys(scenarios).join(", ")}（省くと home）
--time: 基準時刻（例 "2026-09-23T19:00:00+09:00"）。省くと今。`;

const OUT_DIR = fileURLToPath(new URL("../.out/", import.meta.url));
/** 画面から署名器へ繋ぐときの合言葉。ローカル専用なので固定でよい。 */
const BUNKER_SECRET = "streets-screenshot";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    scenario: { type: "string" },
    time: { type: "string" },
    "relay-port": { type: "string", default: "10547" },
    "asset-port": { type: "string", default: "10548" },
    "app-url": { type: "string", default: "http://localhost:5173" },
    help: { type: "boolean", short: "h" },
  },
});

const [command = "serve", positional] = positionals;
if (values.help || !["serve", "seed", "generate"].includes(command)) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const name = (values.scenario ?? positional ?? "home") as ScenarioName;
const scenario = scenarios[name];
if (!scenario) {
  console.error(`シナリオ「${name}」はありません。\n\n${USAGE}`);
  process.exit(1);
}

const relayUrl = `ws://localhost:${values["relay-port"]}`;
const assetUrl = `http://localhost:${values["asset-port"]}`;
const base = parseBaseTime(values.time);
const events = generate(scenario, {
  base,
  relayUrl,
  asset: createAssetReader(assetUrl),
});

mkdirSync(OUT_DIR, { recursive: true });
const file = join(OUT_DIR, `${name}.jsonl`);
writeFileSync(
  file,
  `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
);
console.log(
  `シナリオ「${name}」: ${scenario.description}\n` +
    `基準時刻 ${new Date(base * 1000).toISOString()} で ${events.length} 件のイベントを ${file} に書き出しました。`,
);

/** 立っているリレーへ 1 件ずつ送り、受け取られたかを確かめる。 */
const publish = async (list: readonly NostrEvent[]) => {
  const socket = new WebSocket(relayUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () =>
        reject(
          new Error(
            `${relayUrl} に繋がりません。pnpm screenshot で立ててください。`,
          ),
        ),
      { once: true },
    );
  });
  const pending = new Map<string, (ok: boolean) => void>();
  socket.addEventListener("message", (message) => {
    const [type, id, ok, reason] = JSON.parse(String(message.data));
    if (type !== "OK") return;
    if (!ok) console.warn(`受け取られませんでした: ${id} ${reason}`);
    pending.get(id)?.(ok);
  });
  let accepted = 0;
  for (const event of list) {
    const ok = await new Promise<boolean>((resolve) => {
      pending.set(event.id, resolve);
      socket.send(JSON.stringify(["EVENT", event]));
    });
    if (ok) accepted++;
  }
  socket.close();
  console.log(`${relayUrl} へ ${accepted} / ${list.length} 件を投入しました。`);
};

/** リレーに繋がるまで待つ。立ち上がりは 1 秒もかからないが、遅い環境のために 10 秒まで待つ。 */
const waitForRelay = async () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const opened = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(relayUrl);
      socket.addEventListener("open", () => {
        socket.close();
        resolve(true);
      });
      socket.addEventListener("error", () => resolve(false));
    });
    if (opened) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${relayUrl} が立ち上がりませんでした`);
};

const viewerPubkey = pubkeyFor(scenario.viewer);
const bunkerUrl = `bunker://${viewerPubkey}?relay=${encodeURIComponent(relayUrl)}&secret=${BUNKER_SECRET}`;

if (command === "seed") {
  await publish(events);
} else if (command === "serve") {
  const onSpawnError = (error: Error) => {
    console.error(
      `nak を起動できません（${error.message}）。README の「必要なもの」を見てください。`,
    );
    process.exit(1);
  };
  const relay = spawn(
    "nak",
    ["serve", "--port", values["relay-port"], "--events", file],
    { stdio: "inherit" },
  ).on("error", onSpawnError);
  // 署名器はリレーに繋ぎに行くので、リレーが受け付け始めてから立てる。
  await waitForRelay();
  const bunker = spawn(
    "nak",
    [
      "bunker",
      "--sec",
      bytesToHex(secretKeyFor(scenario.viewer)),
      // 合言葉を知っている画面にだけ応える。
      "--authorized-secrets",
      BUNKER_SECRET,
      relayUrl,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  ).on("error", onSpawnError);
  const children = [relay, bunker];
  const assets = serveAssets(Number(values["asset-port"]));
  const stop = () => {
    for (const child of children) child.kill();
    assets.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(`
リレー      ${relayUrl}（止めると空に戻ります）
画像        ${assetUrl}
見る人      ${scenario.viewer}（${encodeBech32("npub", viewerPubkey)}）

1. 別の端末で  pnpm dev
2. 開く        ${values["app-url"]}/?relays=${relayUrl}&screenshot
3. ログイン    「リモート署名器でログイン」に次を貼る
               ${bunkerUrl}

Ctrl+C でまとめて止めます。`);
}
