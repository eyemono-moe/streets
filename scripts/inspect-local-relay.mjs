#!/usr/bin/env node
/**
 * ローカルリレーの NIP-11 文書と kind:1 の件数を表示する。
 *
 * /debug/v1-section に出ている値と突き合わせるための「期待値」を出す。
 * 画面の items とここの kind:1 件数が一致していれば、届いたイベントが
 * すべて id 再計算・schnorr 署名検証・構造検証を通過したということ。
 *
 *   pnpm dev:relay:inspect
 *
 * 手順の全体は docs/design/verifying-v1-section.md を参照。
 */

const RELAY_URL = process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";
const INFO_URL = RELAY_URL.replace(/^wss:\/\//, "https://").replace(
  /^ws:\/\//,
  "http://",
);

const fetchRelayInfo = async () => {
  try {
    const response = await fetch(INFO_URL, {
      headers: { Accept: "application/nostr+json" },
    });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    return { info: await response.json() };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) };
  }
};

const countShortTextNotes = () =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(RELAY_URL);
    let count = 0;
    const timeout = setTimeout(() => {
      socket.close();
      resolve({ count, complete: false });
    }, 10_000);

    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`could not connect to ${RELAY_URL}`));
    };
    socket.onopen = () =>
      socket.send(
        JSON.stringify(["REQ", "inspect", { kinds: [1], limit: 5000 }]),
      );
    socket.onmessage = (message) => {
      const [type] = JSON.parse(message.data);
      if (type === "EVENT") count += 1;
      if (type === "EOSE") {
        clearTimeout(timeout);
        socket.close();
        resolve({ count, complete: true });
      }
    };
  });

console.log(`relay ${RELAY_URL}\n`);

const { info, error } = await fetchRelayInfo();
console.log("NIP-11");
if (error) {
  console.log(`  取得できませんでした (${error})`);
  console.log("  → 画面には 'no relay info' が出るのが正しい挙動です");
} else {
  console.log(`  name            ${info.name ?? "-"}`);
  console.log(`  supported_nips  ${(info.supported_nips ?? []).join(",")}`);
  console.log(
    `  max_limit       ${info.limitation?.max_limit ?? "-  (このリレーは公開していません。'-' が正常)"}`,
  );
}

try {
  const { count, complete } = await countShortTextNotes();
  console.log(
    `\nkind:1  ${count} 件${complete ? "" : " (EOSE 未達のため打ち切り)"}`,
  );
  console.log("\n/debug/v1-section の items がこの件数と一致していれば、");
  console.log("届いたイベントはすべて検証を通過しています。");
  process.exit(0);
} catch (cause) {
  console.error(`\n${cause.message}`);
  console.error("ローカルリレーは起動していますか: docker compose up -d");
  process.exit(1);
}
