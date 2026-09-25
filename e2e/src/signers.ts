import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import {
  conversationKey,
  decryptNip44,
  encryptNip44,
} from "@streets/core/signer/nip46/nip44";
import { RELAY_URL } from "./env";
import type { Template, User } from "./users";

/** 署名器の振る舞いを、テストの途中で変える。 */
export type SignerBehavior = "sign" | "reject" | "hang";

/**
 * NIP-07 の拡張機能の代わり。ページには `window.nostr` の形だけを置き、署名は
 * Node の側でテスト用の鍵を使って行う。鍵をページへ渡さないのは本物の拡張機能と同じ。
 */
export const installNip07 = async (
  context: BrowserContext,
  user: () => User | undefined,
  behavior: () => SignerBehavior,
) => {
  await context.exposeFunction(
    "__e2eNip07",
    async (method: string, template?: Template) => {
      const current = user();
      if (!current) throw new Error("拡張機能に鍵がありません");
      if (method === "getPublicKey") return current.pubkey;
      switch (behavior()) {
        case "reject":
          throw new Error("署名を拒否しました");
        case "hang":
          return new Promise(() => {});
        case "sign":
          if (!template) throw new Error("署名するイベントがありません");
          return current.sign(template);
      }
    },
  );
  // NIP-78（デッキの同期など）は NIP-44 で暗号化する。対応した拡張機能を模すため、
  // ここでも同じ NIP-44 の実装（core の NIP-46 client key と共用）で応じる。
  await context.exposeFunction(
    "__e2eNip07Nip44",
    async (op: "encrypt" | "decrypt", peerPubkey: string, text: string) => {
      const current = user();
      if (!current) throw new Error("拡張機能に鍵がありません");
      const key = conversationKey(current.secretKey, peerPubkey);
      return op === "encrypt"
        ? encryptNip44(text, key)
        : decryptNip44(text, key);
    },
  );
  await context.addInitScript(() => {
    const call = (
      window as unknown as {
        __e2eNip07: (method: string, arg?: unknown) => Promise<unknown>;
      }
    ).__e2eNip07;
    const nip44 = (
      window as unknown as {
        __e2eNip07Nip44: (
          op: "encrypt" | "decrypt",
          peerPubkey: string,
          text: string,
        ) => Promise<string>;
      }
    ).__e2eNip07Nip44;
    Object.assign(window, {
      nostr: {
        getPublicKey: () => call("getPublicKey"),
        signEvent: (template: unknown) => call("signEvent", template),
        nip44: {
          encrypt: (peerPubkey: string, plaintext: string) =>
            nip44("encrypt", peerPubkey, plaintext),
          decrypt: (peerPubkey: string, ciphertext: string) =>
            nip44("decrypt", peerPubkey, ciphertext),
        },
      },
    });
  });
};

const BUNKER_SECRET = "streets-e2e";

/** 立てた nak の署名器。止めると、署名器が応答しなくなった状態を作れる。 */
export type RemoteSigner = { stop(): void };

const spawnNak = (args: string[]): ChildProcess => {
  const child = spawn("nak", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(
        `nak ${args.join(" ")} が止まりました（${code}）\n${stderr}`,
      );
    }
  });
  return child;
};

/**
 * 署名器がリレーで待ち受け始めるまで待つ。nak serve は誰も購読していない宛先への
 * 一時イベントを受け取らないので、先に画面から頼むと接続要求が落ちる。
 */
const listening = (child: ChildProcess) =>
  new Promise<void>((resolve, reject) => {
    let output = "";
    child.stderr?.on("data", (chunk) => {
      output += String(chunk);
      if (output.includes("listening at")) resolve();
    });
    child.on("exit", () =>
      reject(new Error(`nak の署名器が立ち上がりませんでした\n${output}`)),
    );
  });

/** `nak bunker` を立て、画面に貼る `bunker://` を返す。 */
export const startBunker = async (
  user: User,
): Promise<{ uri: string; signer: RemoteSigner }> => {
  const child = spawnNak([
    "bunker",
    "--sec",
    user.secretHex,
    "--authorized-secrets",
    BUNKER_SECRET,
    RELAY_URL,
  ]);
  await listening(child);
  const uri = `bunker://${user.pubkey}?relay=${encodeURIComponent(RELAY_URL)}&secret=${BUNKER_SECRET}`;
  return { uri, signer: { stop: () => child.kill() } };
};

/**
 * 画面が出した `nostrconnect://` に、`nak` の署名器から繋ぎに行く。`nak bunker connect`
 * は動いている署名器へ UNIX ソケットで頼むので、先に `--persist` で署名器を立てる。
 * ソケットのパスは 108 バイトまでなので、設定の置き場は短い一時ディレクトリにする。
 */
export const answerNostrConnect = async (
  user: User,
  uri: string,
): Promise<RemoteSigner> => {
  const config = await mkdtemp(join(tmpdir(), "nak-"));
  const common = ["--config-path", config];
  const child = spawnNak([
    ...common,
    "bunker",
    "--persist",
    "--profile",
    PROFILE,
    "--sec",
    user.secretHex,
    RELAY_URL,
  ]);
  const stop = () => {
    child.kill();
    void rm(config, { recursive: true, force: true });
  };
  try {
    await listening(child);
  } catch (error) {
    stop();
    throw error;
  }
  const code = await new Promise<number | null>((resolve) =>
    spawnNak([...common, "bunker", "connect", "--profile", PROFILE, uri]).on(
      "exit",
      resolve,
    ),
  );
  if (code !== 0) {
    stop();
    throw new Error("nak の署名器が nostrconnect:// に繋げませんでした");
  }
  return { stop };
};

const PROFILE = "e2e";
