import { type Page, test as base, expect } from "@playwright/test";
import { RELAY_URL } from "./env";
import {
  type RemoteSigner,
  type SignerBehavior,
  answerNostrConnect,
  installNip07,
  startBunker,
} from "./signers";
import { type User, createUser } from "./users";

export type LoginMethod = "nip07" | "bunker" | "nostrconnect";

/**
 * 署名器の振る舞いを変える。拒否・無応答は NIP-07 の偽物でだけ作れ、nak の署名器
 * （NIP-46）は止めることしかできない。
 */
export type SignerControl = {
  set(behavior: Exclude<SignerBehavior, "sign">): void;
  stop(): void;
};

type Fixtures = {
  /** ログインする人。テストごとに新しい鍵。 */
  me: User;
  /** アプリを開く。読み書き先はテスト用のリレーだけにする。 */
  openApp: (page?: Page) => Promise<void>;
  /** ようこそ画面から、この project のログイン方法でログインする。 */
  signIn: (user?: User) => Promise<void>;
  signer: SignerControl;
};

type Options = { loginMethod: LoginMethod };

type SignerState = SignerControl & {
  behavior: SignerBehavior;
  user?: User;
  remotes: RemoteSigner[];
};

export const test = base.extend<
  Fixtures & { signerState: SignerState },
  Options
>({
  loginMethod: ["nip07", { option: true, scope: "worker" }],

  context: async ({ context }, use) => {
    // 公開リレーへ繋ぎに行くと、テストが外の状態に左右される。繋がせずに閉じる。
    await context.routeWebSocket(
      (url) => url.hostname !== "localhost",
      (ws) => ws.close(),
    );
    await context.addInitScript(() => {
      localStorage.setItem("streets.v1.tourSeen", "seen");
    });
    await use(context);
  },

  // oxlint-disable-next-line no-empty-pattern -- Playwright は第 1 引数の分割代入から、使う fixture を読み取る
  me: async ({}, use) => {
    await use(await createUser("me"));
  },

  openApp: async ({ page }, use) => {
    await use(async (target = page) => {
      await target.goto(`/?relays=${encodeURIComponent(RELAY_URL)}`);
    });
  },

  signerState: [
    async ({ context, loginMethod }, use) => {
      const state: SignerState = {
        behavior: "sign",
        remotes: [],
        set(next) {
          if (loginMethod !== "nip07") {
            throw new Error("nak の署名器には拒否・無応答をさせられません");
          }
          state.behavior = next;
        },
        stop() {
          if (loginMethod === "nip07") {
            throw new Error("NIP-07 の署名器は止められません");
          }
          for (const remote of state.remotes) remote.stop();
        },
      };
      if (loginMethod === "nip07") {
        await installNip07(
          context,
          () => state.user,
          () => state.behavior,
        );
      }
      await use(state);
      for (const remote of state.remotes) remote.stop();
    },
    { box: true },
  ],

  signer: async ({ signerState }, use) => {
    await use(signerState);
  },

  signIn: async ({ page, loginMethod, me, signerState }, use) => {
    await use(async (user = me) => {
      signerState.user = user;
      await page
        .getByRole("button", { name: /Nostr のアカウントを持っている方/ })
        .click();
      if (loginMethod === "nip07") {
        await page.getByRole("button", { name: /拡張機能でログイン/ }).click();
      } else {
        await page
          .getByRole("button", { name: /リモート署名器でログイン/ })
          .click();
        if (loginMethod === "bunker") {
          await page.getByText("文字列を貼り付ける").click();
          const bunker = await startBunker(user);
          signerState.remotes.push(bunker.signer);
          await page.locator("#bunker-uri").fill(bunker.uri);
          await page.getByRole("button", { name: "接続" }).click();
        } else {
          const uri = await page
            .getByRole("link", { name: "この端末の署名器で開く" })
            .getAttribute("href");
          if (!uri) throw new Error("nostrconnect:// が出ていません");
          const remote = await answerNostrConnect(user, uri);
          signerState.remotes.push(remote);
          // 画面が URI を出してからリレーで待ち受けを始めるまでの間に応答すると、nak serve は
          // 聞き手のいない一時イベントとして捨てる。ログインが済むまで送り直す。
          await expect(async () => {
            await remote.connect();
            await expect(
              page.getByRole("button", { name: "アカウント", exact: true }),
            ).toBeVisible({ timeout: 2_000 });
          }).toPass({ timeout: 20_000 });
        }
      }
      await expect(
        page.getByRole("button", { name: "アカウント", exact: true }),
      ).toBeVisible();
    });
  },
});

export { expect };
