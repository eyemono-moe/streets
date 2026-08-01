import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    if (options.allowFailure) {
      return result;
    }
    process.exit(result.status ?? 1);
  }
  return result;
};

/**
 * compose の named volume は、実際には "<project>_<name>" という名前で作られる
 * (volumes: 側で name: を明示している場合はそちらが優先される)。
 * compose ファイルに書かれた "postgres" をそのまま docker volume rm に渡すと
 * "no such volume" になり、データが消えないまま処理が続いてしまう。
 */
const volumeName = () => {
  const result = run("docker", ["compose", "config", "--format", "json"], {
    capture: true,
  });
  const config = JSON.parse(result.stdout);
  const source = config.services?.postgres?.volumes?.find(
    (volume) => volume.target === "/var/lib/postgresql/data",
  )?.source;
  if (!source) return undefined;
  return config.volumes?.[source]?.name ?? `${config.name}_${source}`;
};

// nostr-rs-relay-2 (リレー2) はバインドマウント ./data/nostr-rs-relay-2/db を
// sqlite の data_directory としてそのまま使っている。named volume ではないため
// `docker volume rm` では絶対に消えない。コンテナを止めた上でホスト側の
// ファイルを直接消す必要がある。
//
// 一方リレー1 (nostr-rs-relay) にも ./data/nostr-rs-relay/db のバインドマウント
// があるが、.local-dev/nostr-rs-relay-config.toml を見ると engine = "postgres"
// で実データは postgres 側にある。このディレクトリは未使用なので触らなくてよい。
const relay2DbDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "nostr-rs-relay-2",
  "db",
);

const postgresVolume = volumeName();
if (!postgresVolume) {
  throw new Error(
    "Could not resolve the postgres volume from docker compose config",
  );
}

console.log("[streets reset] stopping local relay (1, 2) and postgres");
run("docker", [
  "compose",
  "stop",
  "nostr-rs-relay",
  "nostr-rs-relay-2",
  "postgres",
]);

console.log(`[streets reset] removing postgres volume: ${postgresVolume}`);
run("docker", ["compose", "rm", "-f", "-s", "-v", "postgres"]);

// 初回など、まだボリュームが存在しない場合の失敗は正常。
// ただし黙って握り潰すとリセットされていないことに気付けないため、必ず報告する。
const removed = run("docker", ["volume", "rm", postgresVolume], {
  capture: true,
  allowFailure: true,
});
if (removed.status !== 0) {
  const reason = (removed.stderr ?? "").trim();
  if (/no such volume/i.test(reason)) {
    console.log(
      `[streets reset] volume ${postgresVolume} did not exist (nothing to remove)`,
    );
  } else {
    console.error(`[streets reset] FAILED to remove ${postgresVolume}`);
    console.error(`[streets reset] ${reason}`);
    console.error(
      "[streets reset] データベースはリセットされていません。シード結果は決定的になりません。",
    );
    process.exit(1);
  }
}

console.log(`[streets reset] removing リレー2 (sqlite) files: ${relay2DbDir}`);
try {
  const entries = existsSync(relay2DbDir) ? readdirSync(relay2DbDir) : [];
  for (const entry of entries) {
    rmSync(path.join(relay2DbDir, entry), { recursive: true, force: true });
  }
  if (entries.length === 0) {
    console.log(`[streets reset] ${relay2DbDir} は空でした (削除するものなし)`);
  }
} catch (cause) {
  console.error(`[streets reset] FAILED to clear ${relay2DbDir}`);
  console.error(
    `[streets reset] ${cause instanceof Error ? cause.message : String(cause)}`,
  );
  console.error(
    "[streets reset] データベースはリセットされていません。シード結果は決定的になりません。",
  );
  process.exit(1);
}

console.log("[streets reset] starting local relay (1, 2) and postgres");
run("docker", [
  "compose",
  "up",
  "-d",
  "postgres",
  "nostr-rs-relay",
  "nostr-rs-relay-2",
]);

console.log("[streets reset] local relay database reset complete");
