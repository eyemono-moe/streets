# v1 縦断スライス Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログインから投稿までを縦に貫く最小の動くものを `/v1-preview` に作り、読み取り層への押し返しを実物で得る。

**Architecture:** 既存の読み取り層（`src/core/read/`、3,000 行超）はそのまま使う。新規は署名器の seam、書き込み経路、デッキ、UI の 4 つで、いずれも意図的に薄く作る。

**Tech Stack:** TypeScript (strict), SolidJS, Vitest, Playwright, Biome, pnpm

**仕様:** [docs/superpowers/archive/specs/2026-08-04-v1-vertical-slice-design.md](../specs/2026-08-04-v1-vertical-slice-design.md) — **着手前に全文を読むこと。** 特に 2 節（「薄く作る」の意味）と 10 節（このスライスが答えるべき問い）が各タスクの判断根拠である。

## Global Constraints

- **薄く作る。** 承認済み ADR を実装しないのではなく、**まだ実装しない**。レンダラ登録機構（ADR-0003）・宣言的 `needs`（ADR-0017）・NIP-78 デッキ（ADR-0013）はいずれも今回作らない。一般形が要ると分かったら、それを followups に記録する（作らない）。
- **`secretKey` という語を `src/core/signer/` に出さない。** ADR-0008（秘密鍵を保持しない）の実装上の意味はこれである。
- **ソケットを開くのは `ConnectionPool` だけ。** publish も例外にしない。ADR-0011 の 30 接続予算を実際に強制しているのがこの一点であり、迂回路を増やすと数字が意味を失う。
- **`{ reserved: true }` はブートストラップ専用。** 新しい呼び出し元を作らないこと（`connection-pool.ts` の `SubscribeOptions` の注意書きを読む）。
- コメントは日本語。既存ファイルのコメント密度と語り口に合わせる。
- 各タスクの最後に `pnpm exec vitest run`・`pnpm typecheck`・`pnpm check` を通してからコミットする。
- **Playwright は `--grep-invert "repost parser warning flood"` を付ける。** `e2e/console-warning.spec.ts` は旧実装 (`/`) 向けの既存の失敗で、clean tree でも落ちる。無関係なので直そうとしないこと。

### 検証の強度をタスクごとに変える（意図的な方針）

仕様 8 節の較正をこの計画にも適用する。**これは手抜きではなく、欠陥の出方が違うものに同じ道具を当てない、という判断である。**

- **純粋ロジックのタスク（1, 3, 4, 5, 6 の一部）** —— 参照コードを計画に載せ、期待値は計算し、各テストが捕まえる変異を明記する。入出力が閉じており、この道具が効く。
- **UI 配線のタスク（2, 3, 6 の一部）** —— 計画は**契約と受け入れ確認（何が見えれば正しいか）**を書き、JSX を逐語では書かない。UI の正しさは目で見て判断するものであり、実行されていない参照 JSX を計画に書くと、**過去 3 スライスで繰り返した「計画由来の欠陥」を UI にも持ち込むことになる**。実装者は自分で書いて、自分の目で確かめること。

### タスクの順序について

**早く画面に出すことを優先している。** Task 1 でログインが、Task 2 で本物のタイムラインが見える。純粋な部品を先に全部作ってから UI を載せる順序は、まさにこのスライスが正そうとしている失敗である。

---

### Task 1: 署名器の seam と `/v1-preview` のログイン

**Files:**
- Create: `src/core/signer/signer.ts`, `src/core/signer/nip07-signer.ts`, `src/core/signer/fake-signer.ts`
- Create: `src/core/signer/nip07-signer.test.ts`
- Create: `src/routes/v1-preview.tsx`
- Modify: `src/router.tsx`

**Interfaces:**
- Produces:
  ```ts
  // src/core/signer/signer.ts
  export type Signer = {
    getPublicKey(): Promise<string>;
    signEvent(template: UnsignedEvent): Promise<NostrEvent>;
  };
  export class SignerUnavailableError extends Error {}

  // src/core/signer/nip07-signer.ts
  export const createNip07Signer: () => Signer;   // window.nostr を掴む。無ければ呼び出し時に SignerUnavailableError
  export const isNip07Available: () => boolean;

  // src/core/signer/fake-signer.ts
  export const createFakeSigner: (secretKey: Uint8Array) => Signer;  // テスト専用
  ```

**注意:** `createFakeSigner` は引数名に `secretKey` を使うが、これは**テスト専用ファイル**であり ADR-0008 の禁止対象外（`fake-relay-connection.ts` と同じ位置づけ）。`signer.ts` と `nip07-signer.ts` には出さないこと。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/signer/nip07-signer.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignerUnavailableError } from "./signer";
import { createNip07Signer, isNip07Available } from "./nip07-signer";

const setNostr = (value: unknown) => {
  (globalThis as { nostr?: unknown }).nostr = value;
};

afterEach(() => {
  (globalThis as { nostr?: unknown }).nostr = undefined;
});

describe("createNip07Signer", () => {
  it("拡張機能が無ければ isNip07Available が false", () => {
    // 捕まえる変異: 存在確認を省いて常に true を返す
    setNostr(undefined);
    expect(isNip07Available()).toBe(false);
  });

  it("拡張機能があれば true", () => {
    setNostr({ getPublicKey: async () => "x", signEvent: async (e: unknown) => e });
    expect(isNip07Available()).toBe(true);
  });

  it("拡張機能が無い状態で getPublicKey を呼ぶと SignerUnavailableError", async () => {
    // 捕まえる変異: undefined へのアクセスを素通しして TypeError を投げる
    // (呼び出し側が「拡張が無い」と「拡張が壊れている」を区別できなくなる)
    setNostr(undefined);
    const signer = createNip07Signer();
    await expect(signer.getPublicKey()).rejects.toBeInstanceOf(
      SignerUnavailableError,
    );
  });

  it("signer の生成時点では拡張機能の有無を確かめない", async () => {
    // 捕まえる変異: createNip07Signer() の中で window.nostr を掴んで固定する
    // (ページ読み込み直後は拡張がまだ注入されていないことがあり、
    //  生成時に掴むと「後から入った拡張」を永久に見失う)
    setNostr(undefined);
    const signer = createNip07Signer();
    setNostr({
      getPublicKey: async () => "a".repeat(64),
      signEvent: async (e: unknown) => e,
    });
    await expect(signer.getPublicKey()).resolves.toBe("a".repeat(64));
  });

  it("getPublicKey が返した値をそのまま通す", async () => {
    const pubkey = "b".repeat(64);
    setNostr({ getPublicKey: async () => pubkey, signEvent: async (e: unknown) => e });
    await expect(createNip07Signer().getPublicKey()).resolves.toBe(pubkey);
  });

  it("signEvent は拡張機能が返した署名済みイベントをそのまま返す", async () => {
    // 捕まえる変異: 拡張の戻り値を捨てて template を返す (sig が付かない)
    const signed = {
      id: "c".repeat(64),
      pubkey: "b".repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: "hi",
      sig: "d".repeat(128),
    };
    const signEvent = vi.fn(async () => signed);
    setNostr({ getPublicKey: async () => "b".repeat(64), signEvent });
    const result = await createNip07Signer().signEvent({
      pubkey: "b".repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: "hi",
    });
    expect(result).toEqual(signed);
    expect(signEvent).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/core/signer/nip07-signer.test.ts`
Expected: FAIL — `Failed to resolve import "./nip07-signer"`

- [ ] **Step 3: seam と実装を書く**

`src/core/signer/signer.ts`:

```ts
import type { NostrEvent, UnsignedEvent } from "../nostr/event";

/**
 * 署名する能力だけを表す seam ([ADR-0008](../../../../docs/adr/0008-signer-only-key-handling.md))。
 *
 * **このファイルと `nip07-signer.ts` に `secretKey` という語を出さないこと。**
 * アプリが秘密鍵を持たない、という決定の実装上の意味はそれである。鍵を持って
 * いるのは常に外部の署名器 (NIP-07 拡張、将来は NIP-46 のリモート署名器) で
 * あり、こちら側は「署名してもらう」ことしかできない。
 */
export type Signer = {
  getPublicKey(): Promise<string>;
  signEvent(template: UnsignedEvent): Promise<NostrEvent>;
};

/** 署名器が使えない (NIP-07 拡張が入っていない等)。 */
export class SignerUnavailableError extends Error {
  constructor(message = "no NIP-07 signer available") {
    super(message);
    this.name = "SignerUnavailableError";
  }
}
```

`src/core/signer/nip07-signer.ts`:

```ts
import type { NostrEvent, UnsignedEvent } from "../nostr/event";
import { type Signer, SignerUnavailableError } from "./signer";

type Nip07 = {
  getPublicKey(): Promise<string>;
  signEvent(template: UnsignedEvent): Promise<NostrEvent>;
};

/** `window.nostr` を「今」読む。生成時にキャッシュしない (下記)。 */
const nip07 = (): Nip07 | undefined =>
  (globalThis as { nostr?: Nip07 }).nostr;

export const isNip07Available = (): boolean => nip07() !== undefined;

/**
 * NIP-07 拡張を `Signer` に合わせる。
 *
 * **生成時に `window.nostr` を掴まない。** 拡張機能はページ読み込みの直後には
 * まだ注入されていないことがあり、生成時に掴んで固定すると、後から入った
 * 拡張を永久に見失う。呼び出しのたびに読み直す。
 */
export const createNip07Signer = (): Signer => ({
  getPublicKey: async () => {
    const api = nip07();
    if (!api) throw new SignerUnavailableError();
    return api.getPublicKey();
  },
  signEvent: async (template) => {
    const api = nip07();
    if (!api) throw new SignerUnavailableError();
    return api.signEvent(template);
  },
});
```

`src/core/signer/fake-signer.ts`:

```ts
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { Signer } from "./signer";

/**
 * テストからのみ使う偽の署名器 (`src/core/relay/fake-relay-connection.ts` や
 * `src/core/read/fake-clock.ts` と同じ位置づけ)。**本物の署名を作る** ——
 * `EventStore.put` は schnorr 検証を通すので、偽の sig では素通りしない。
 *
 * このファイルだけは秘密鍵を引数に取る。ADR-0008 が禁じているのは
 * **アプリが**鍵を保持することであり、テストが自分で鍵を作ることではない。
 */
export const createFakeSigner = (secretKey: Uint8Array): Signer => {
  const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
  return {
    getPublicKey: async () => pubkey,
    signEvent: async (template): Promise<NostrEvent> => {
      const unsigned = { ...template, pubkey };
      const id = computeEventId(unsigned);
      return {
        ...unsigned,
        id,
        sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)),
      };
    },
  };
};
```

**`signEvent` が `template.pubkey` ではなく鍵から導いた `pubkey` を使う点に注意。** NIP-07 拡張も同じ振る舞いをする（署名器が自分の鍵で署名する以上、pubkey は署名器が決める）。テストが誤った pubkey を渡しても、署名と一致する方が採用される。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/core/signer/`
Expected: PASS（6 件）

- [ ] **Step 5: `/v1-preview` にログインだけを作る**

`src/routes/v1-preview.tsx` を作り、`src/router.tsx` の `children` に `{ path: "/v1-preview", component: lazy(() => import("./routes/v1-preview")) }` を足す。

**受け入れ確認（これが見えれば正しい）:**

1. NIP-07 拡張を無効にして `/v1-preview` を開く → 「拡張機能が見つかりません」の主旨が出て、**画面が壊れない**
2. 拡張を有効にして開く → ログインボタンが出る
3. 押す → 拡張の承認ダイアログが出て、承認すると**自分の pubkey が画面に出る**
4. 拒否する → エラー表示が出て、**画面が壊れない**

JSX は逐語指定しない（Global Constraints の較正方針）。`data-testid="login"` / `data-testid="viewer-pubkey"` / `data-testid="signer-error"` は Task 7 の e2e が使うので付けること。

- [ ] **Step 6: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/core/signer src/routes/v1-preview.tsx src/router.tsx
git commit -m "feat(signer): add the signer seam and a NIP-07 login on /v1-preview"
```

---

### Task 2: ホームカラム —— 本物のタイムラインを出す

**Files:**
- Modify: `src/routes/v1-preview.tsx`
- Create: `src/routes/v1-preview/Note.tsx`（またはこれに準じる置き場所）

**Interfaces:**
- Consumes: `Signer`（Task 1）、既存の `createSection` / `SubscriptionManager` / `warmUpRouting`

**このタスクは UI 配線である。** 参照 JSX は書かない。代わりに、配線の正解と受け入れ確認を示す。

- [ ] **Step 1: 読み取り層の配線を写す**

`src/routes/debug/v1-section.tsx` が**すでに必要な配線をすべて持っている**。それを読み、`/v1-preview` に同じ構成を作る:

`EventStore` → `RoutingTable` → `SubscriptionManager`（`connect: connectRelay`）→ `warmUpRouting({ pubkey, store, pool: manager.pool, indexers })` → `createSection({ source, store, manager })`。

**デバッグルートとの違いは 2 点だけ:**

1. **本物のリレーを使う。** デバッグルートはローカルリレーをハードコードしているが、こちらは `src/core/read/default-relays.ts` の `BOOTSTRAP_INDEXERS` と `FALLBACK_RELAYS` を使う。**自分の鍵でログインして自分のタイムラインが出ることがこのスライスの目的**であり、ローカルリレーではそれが確かめられない。
2. **pubkey はログインから来る。** クエリパラメータではない。

**ただし e2e はローカルリレーに向ける必要がある。** `?relays=` のようなクエリパラメータで上書きできるようにすること（デバッグルートが `?budget=` でやっているのと同じ形）。**既定は本物のリレー**で、上書きは e2e 専用と分かるコメントを付ける。

- [ ] **Step 2: kind:1 を描画する**

`Note.tsx` を作る。表示するのは本文・`created_at`・著者の短縮 pubkey。**プロフィールは Task 5 まで出さない。**

`section.items()` を `<For>` で回す。`section.status()` の `phase` と `incomplete` も出す（生の数値のまま。仕様 7 節）。

- [ ] **Step 3: 受け入れ確認**

自分の鍵でログインして `/v1-preview` を開く。

1. **自分がフォローしている人の投稿が出る**
2. `phase` が `initial` → `streaming` → `settled` と進む
3. `incomplete` が出る場合、その数字が何を指すか自分で説明できる（**これは仕様 10 節の問い 4 そのもの。答えをメモしておくこと**）
4. 投稿が 1 件も出ない場合、**期待値を緩める前に原因を報告する** —— フォロー 0 人・ウォームアップ失敗・ルーティング失敗・接続予算切れで意味が全く違う

- [ ] **Step 4: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/routes/
git commit -m "feat(v1-preview): render the home column from real relays"
```

---

### Task 3: デッキと 3 カラム

**Files:**
- Create: `src/core/deck/deck.ts`, `src/core/deck/deck.test.ts`
- Modify: `src/routes/v1-preview.tsx`

**Interfaces:**
- Produces:
  ```ts
  // src/core/deck/deck.ts
  export type ColumnDef = { id: string; title: string; source: NostrSource };
  export type Deck = { version: 1; columns: ColumnDef[] };
  export const defaultDeck: (viewerPubkey: string, followees: string[]) => Deck;
  export const loadDeck: (raw: string | null) => Deck | undefined;  // 壊れていたら undefined
  export const saveDeck: (deck: Deck) => string;                    // JSON 文字列
  export const DECK_STORAGE_KEY = "streets.v1.deck";
  ```

- [ ] **Step 1: 失敗するテストを書く**

`src/core/deck/deck.test.ts`。**永続化されたデータは信用できない**ことを主張の中心に置く（ユーザーが手で壊す、古いバージョンが残る、別のアプリが同じキーを使う）。

```ts
import { describe, expect, it } from "vitest";
import { type Deck, loadDeck, saveDeck } from "./deck";

const deck: Deck = {
  version: 1,
  columns: [
    { id: "home", title: "ホーム", source: { type: "nostr", filters: [{ kinds: [1] }] } },
  ],
};

describe("loadDeck / saveDeck", () => {
  it("保存したものを読み戻せる", () => {
    expect(loadDeck(saveDeck(deck))).toEqual(deck);
  });

  it("null (未保存) は undefined", () => {
    // 捕まえる変異: null を JSON.parse に渡して例外を投げる
    expect(loadDeck(null)).toBeUndefined();
  });

  it("JSON として壊れていたら undefined", () => {
    // 捕まえる変異: try/catch を省く (初回起動時にアプリが白画面になる)
    expect(loadDeck("{ not json")).toBeUndefined();
  });

  it("version が違えば undefined", () => {
    // 捕まえる変異: version を見ない
    // (NIP-78 へ移すとき、古い形を新しい形として読んで壊れる)
    expect(loadDeck(JSON.stringify({ ...deck, version: 2 }))).toBeUndefined();
  });

  it("columns が配列でなければ undefined", () => {
    // 捕まえる変異: 形を確かめずキャストする
    expect(loadDeck(JSON.stringify({ version: 1, columns: "nope" }))).toBeUndefined();
  });

  it("column の必須フィールドが欠けていれば undefined", () => {
    // 捕まえる変異: 要素の中身を確かめない (title の無いカラムで描画時に落ちる)
    expect(
      loadDeck(JSON.stringify({ version: 1, columns: [{ id: "a" }] })),
    ).toBeUndefined();
  });
});
```

**`defaultDeck` のテストも書くこと。** 3 本（ホーム = `{ kinds:[1], authors: followees }` ルーティング / 単一著者 = `{ kinds:[1], authors:[viewerPubkey] }` / 明示リレー = `relays` を持つ）が返り、`id` が重複しないこと。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/core/deck/`
Expected: FAIL — `Failed to resolve import "./deck"`

- [ ] **Step 3: 実装する**

`loadDeck` は**構造を実際に確かめる**こと。`JSON.parse` の結果をそのままキャストしないこと —— `EventStore` が `isNostrEvent` でリレーからの値を確かめているのと同じ理由で、localStorage の値も外部入力である。

`version` を持たせる理由をコメントに書くこと: NIP-78 へ移すとき（ADR-0013）に移行の足場が要る。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/core/deck/`
Expected: PASS

- [ ] **Step 5: UI にデッキを繋ぐ**

`/v1-preview` がデッキからカラムを描く。localStorage に無ければ `defaultDeck` を使って保存する。

**受け入れ確認:**
1. 3 本のカラムが横に並ぶ
2. **リロードしても同じ 3 本が出る**
3. localStorage の値を手で壊してリロード → 既定のデッキに戻り、**白画面にならない**
4. 3 本開いた状態で接続数を確認する（デバッグルートの `connections` / `peakConnections` に相当するものを出す。**仕様 10 節の問い 2 の材料**）

- [ ] **Step 6: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/core/deck src/routes/
git commit -m "feat(deck): persist a three-column deck to localStorage"
```

---

### Task 4: `SubscriptionManager` に fetch-once を公開する

**Files:**
- Modify: `src/core/read/subscription-manager.ts`
- Modify: `src/core/read/subscription-manager.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // SubscriptionManager の新しい公開メソッド
  fetchOnce(
    filters: RelayFilter[],
    options?: { relays?: RelayUrl[]; timeoutMs?: number },
  ): Promise<void>;
  ```
  解決したら、取れたイベントは `EventStore` に入っている。呼び出し側は `store` から読む（`warmUpRouting` と同じ規約）。

**設計上の制約（仕様 5 節）:**

- **新しい意味論を発明しない。** `bootstrap.ts` の module-local な `collect()` が既に「全リレーが EOSE か CLOSED を報告するかタイムアウトしたら解決し、購読を閉じる」を実装している。**それを公開面へ出すだけ**にする。
- **`{ reserved: true }` を使わないこと。** `collect()` はブートストラップ専用の予算迂回を使っているが、`fetchOnce` は一般の呼び出し元向けなので**通常の予算経路**を通る。予算が埋まっていれば取れない —— それは正しい振る舞いである（ADR-0011）。
- **ページネーション（`until` / カーソル）は含めない。** 一般形には rx-nostr の backward / forward strategy に相当する整理が要り、それは今回やらない（仕様 5 節）。

- [ ] **Step 1: 失敗するテストを書く**

`subscription-manager.test.ts` に追加。既存の `createFakeClock`（`./fake-clock`）と `FakeRelayConnection` を使う。

主張と、それぞれが捕まえる変異:

| 主張 | 捕まえる変異 |
|---|---|
| 全リレーが EOSE を報告したら解決する | EOSE を待たず即解決する |
| 解決した時点で購読が閉じている（`FakeRelayConnection` の `subscriptions[i].closed`） | 閉じ忘れ（購読が漏れ続ける） |
| 1 本が CLOSED、1 本が EOSE でも解決する | CLOSED を settle と数えない（永久に待つ） |
| 同じリレーが EOSE のあと CLOSED を出しても二重に数えない | 単純なカウントダウン（他のリレーを待たずに解決する） |
| タイムアウトで解決し、未応答の購読も閉じる | タイムアウト経路で閉じ忘れる |
| 届いたイベントが `EventStore` に入っている | ストアへ入れ忘れ |
| フィルタに一致しないイベントは入らない | 信頼境界（後続 #4）の迂回 |

**最後の 1 行は重要である。** `fetchOnce` は新しい受信経路なので、ローカルフィルタ照合（`matchesAnyFilter`）を通さないと、閉じたばかりの信頼境界に穴を開けることになる。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/subscription-manager.test.ts`
Expected: FAIL — `manager.fetchOnce is not a function`

- [ ] **Step 3: 実装する**

`bootstrap.ts` の `collect()` を読み、その settle 判定（`settled` セットで 1 URL 1 回だけ数える、EOSE と CLOSED の両方を settle とする、finish で残りを閉じる）をそのまま持ってくる。

**`collect()` 自体を共有化するか、`fetchOnce` に書き直すかは実装者の判断でよい。** 共有化する場合、`bootstrap.ts` 側は `{ reserved: true }` を使い続ける必要がある点に注意すること（インデクサは予算が埋まっていても開かねばならない）。**どちらを選んだかと理由を報告に書くこと。**

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/core/read/`
Expected: PASS

- [ ] **Step 5: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/core/read/
git commit -m "feat(read): expose fetch-once, the semantics bootstrap already had"
```

---

### Task 5: プロフィール要求のコアレッサと `<Profile>`

**Files:**
- Create: `src/core/read/profile-requests.ts`, `src/core/read/profile-requests.test.ts`
- Create: `src/routes/v1-preview/Profile.tsx`（またはこれに準じる置き場所）
- Modify: `src/routes/v1-preview.tsx`（`Note` に `<Profile>` を差す）

**Interfaces:**
- Consumes: `manager.fetchOnce(filters, options)`（Task 4）、`Scheduler` / `defaultScheduler`（`src/core/read/connection-pool.ts`）
- Produces:
  ```ts
  export type ProfileRequests = {
    /** この pubkey のプロフィールを要求する。既に取得済みなら何もしない。 */
    request(pubkey: string): void;
    dispose(): void;
  };
  export const createProfileRequests: (options: {
    store: EventStore;
    manager: SubscriptionManager;
    scheduler?: Scheduler;
  }) => ProfileRequests;
  ```

**仕様 4 節を読むこと。** 当初案（全カラムの `items` から著者集合を導出して購読する）は**誤りとして記録されている**。イベント単位で要求し、コアレッサがまとめる。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/read/profile-requests.test.ts`。`manager` はスタブでよい（`fetchOnce` の呼ばれ方を観測する）。

| 主張 | 捕まえる変異 |
|---|---|
| 窓の中の複数の `request` が **1 回**の `fetchOnce` にまとまる | まとめずに 1 件ずつ呼ぶ（N+1 そのもの） |
| そのフィルタが `{ kinds: [0], authors: [要求された全員] }` である | kinds を間違える／authors を 1 件しか載せない |
| 同じ pubkey を 2 回要求しても authors に 1 回しか入らない | 重複排除の欠落 |
| 既に `EventStore` に kind:0 がある pubkey は要求しない | ストアを見ずに毎回引く（無駄な REQ） |
| 窓が閉じた後の新しい要求は**次の**バッチになる | 最初のバッチだけ処理して以後を捨てる |
| `dispose()` 後は `fetchOnce` を呼ばない | タイマーの後始末忘れ |

**タイマーは注入した `Scheduler` で刻むこと**（`connection-pool.ts` の `defaultScheduler` を既定にする）。読み取り層が実タイマーを直接掴まない規約に従う。既存の `createFakeClock` でテストする。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `pnpm exec vitest run src/core/read/profile-requests.test.ts`
Expected: FAIL — `Failed to resolve import "./profile-requests"`

- [ ] **Step 3: 実装する**

まとめる窓の長さは定数にし、名前と根拠をコメントに書くこと。**`NOTIFY_BATCH_MS`（16ms、`section-reader.ts`）と同じ値にする必要はない** —— あちらは描画の 1 フレーム、こちらはネットワーク要求のまとめであり、目的が違う。実装者が選び、選んだ理由を書くこと。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run src/core/read/profile-requests.test.ts`
Expected: PASS

- [ ] **Step 5: `<Profile>` を作って `Note` に差す**

`<Profile pubkey={...} />` はマウント時に `request(pubkey)` を呼び、`EventStore` から kind:0 を読んで `name` / `picture` を出す。まだ無ければ短縮 pubkey のままにする（**空欄にしない**）。

kind:0 の `content` は JSON 文字列である。**パースに失敗しても落ちないこと** —— リレーから来る値であり、`EventStore` は形を保証しない。

**受け入れ確認:**
1. タイムラインに**名前とアイコンが出る**
2. ネットワークタブで kind:0 の REQ が**イベント数ぶんではなく、まとまった回数**しか出ていない（**仕様 10 節の問い 1 の材料**）
3. プロフィールを持たない著者は短縮 pubkey のまま出る

- [ ] **Step 6: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/core/read/profile-requests.ts src/core/read/profile-requests.test.ts src/routes/
git commit -m "feat(read): coalesce profile requests instead of fetching per note"
```

---

### Task 6: 書き込み経路と投稿フォーム

**Files:**
- Modify: `src/core/read/connection-pool.ts`（publish 経路）
- Create: `src/core/write/publisher.ts`, `src/core/write/publisher.test.ts`
- Modify: `src/core/read/bootstrap.ts`（自分の kind:10002 も引く）
- Modify: `src/routes/v1-preview.tsx`

**Interfaces:**
- Consumes: `Signer`（Task 1）、`RoutingTable.writeRelaysFor(pubkey)`
- Produces:
  ```ts
  export type PublishResult = {
    accepted: RelayUrl[];
    rejected: { relay: RelayUrl; reason: string }[];
  };
  export const createPublisher: (options: {
    pool: ConnectionPool;
    routing: RoutingTable;
    fallbackRelays: readonly RelayUrl[];
  }) => { publish(event: NostrEvent): Promise<PublishResult> };
  ```

- [ ] **Step 1: `warmUpRouting` が自分の kind:10002 も引くようにする**

現在フェーズ②は `{ kinds: [10002], authors: followees }` である。**自分は followees に入っているとは限らない**ので、自分の write リレーが分からず publish 先が決まらない。`authors` に自分の pubkey を足す（重複排除すること）。

既存の `bootstrap.test.ts` に「自分の kind:10002 も引ける」主張を足す。**捕まえる変異: authors に viewer を足し忘れる。**

- [ ] **Step 2: `ConnectionPool` に publish 経路を足す**

**これは Global Constraints の「ソケットを開くのは `ConnectionPool` だけ」を守るための変更である。** publish がプールを通らなければ、ADR-0011 の 30 接続予算の外にもう 1 系統ソケットができ、`reserved` が既に開けている穴と同じものが増える。

**予算が埋まっているときは、そのリレーへの publish を失敗させ `rejected` に載せる。** `{ reserved: true }` を使って迂回しないこと。

この裁定の理由: ADR-0011 は「黙って欠落させてはならない」と定めており、**予算切れで送れなかったことを `rejected` として見せるのは、その要求を満たす形**である。一方、迂回すれば 30 という数字がまた 1 つ意味を失う。

**ただしこれが正しい UX かどうかは別問題である。** 投稿はユーザーが起こした対話的な操作なので、閲覧用の購読より優先されるべきかもしれない（外部レビューが提案していた `interactiveReserve` はまさにこれ）。**今回は予算の階層化をやらない**ので、この裁定は「一番単純で、かつ黙らない形」を選んだものである。**実際に予算切れで投稿が落ちたら、それを followups に記録すること**（Task 7 Step 4 の材料になる）。

テストを書く。捕まえる変異:
- プールを通さず直接 `connect()` する（予算チェックが効かなくなる）
- 予算切れを握り潰して `accepted` に載せる（黙って欠落する）

- [ ] **Step 3: `publisher.ts` を書く**

送信先は `routing.writeRelaysFor(viewerPubkey)`。空なら `fallbackRelays`。

| 主張 | 捕まえる変異 |
|---|---|
| 自分の write リレー全部へ送る | 1 本目だけに送る |
| write リレーが無ければ fallback へ送る | 空配列へ送って黙って何もしない |
| 1 本が失敗しても他は成功として数える | 1 本目の失敗で全体を reject する |
| 全部失敗したら `accepted` が空で `rejected` が全部 | 失敗を握り潰す（ADR-0011「黙って欠落させない」に反する） |

- [ ] **Step 4: 投稿フォームを作る**

**順序が重要である（仕様 6 節）:**

```
署名 (signer.signEvent)
  → EventStore へ挿入 (楽観的更新)
  → publish
```

**この順序だと、ユーザーが署名を拒否した場合に巻き戻す状態が存在しない。** 逆順にしないこと。

**受け入れ確認:**
1. 投稿すると**即座に**（リレーの応答を待たず）自分のカラムに出る
2. しばらくすると、リレーから戻ってきた同じイベントで**重複が増えない**（`EventStore.put` が `"duplicate"` を返す経路）
3. 署名を拒否すると、**タイムラインに何も残らない**
4. publish 結果（どのリレーが受け取ったか）が見える
5. **投稿してから画面に出るまでの体感を記録する**（仕様 10 節の問い 3）

- [ ] **Step 5: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
git add src/core/read/connection-pool.ts src/core/read/bootstrap.ts src/core/write src/routes/
git commit -m "feat(write): publish through the pool to the viewer's own write relays"
```

---

### Task 7: 縦断 e2e とドキュメント

**Files:**
- Create: `e2e/fixtures/seed-preview.ts`, `e2e/v1-preview.spec.ts`
- Modify: `e2e/global-setup.ts`
- Modify: `docs/design/read-layer-followups.md`, `docs/design/architecture.md`

- [ ] **Step 1: fixture を作る**

**鍵の衝突に注意すること。** `e2e/fixtures/` の鍵導出は `((seed + i * 7) % 255) + 1` で**seed 空間が 255 しかない**。過去に 2 件の衝突が起き、既存の e2e が壊れた。`e2e/fixtures/fixture-pubkeys.test.ts` が全 fixture の pubkey が相異なることを検査しているので、**新しい fixture を足したらその一覧にも足すこと**（自動検出ではない）。

閲覧者 1 人 + フォロー相手 2 人、それぞれの kind:0 と kind:1、閲覧者と著者の kind:10002。

- [ ] **Step 2: 縦断 e2e を 1 本書く**

`e2e/v1-preview.spec.ts`。NIP-07 は `page.addInitScript` でスタブする —— **`e2e/console-warning.spec.ts` が既にこの手法を使っている**ので読んで合わせること。署名は fixture の秘密鍵で本物を作れる（`@noble/curves`）。

ローカルリレーへは Task 2 の `?relays=` で向ける。

主張は 1 本の流れとして:

1. ログインすると自分の pubkey が出る
2. カラムにフォロー相手の kind:1 が出る
3. **名前が出る**（短縮 pubkey ではない = コアレッサが動いている）
4. 投稿すると自分のカラムに出る
5. **リロードしても 3 カラムが残る**

- [ ] **Step 3: e2e を走らせ、変異で落ちることを確認する**

```bash
docker compose start nostr-rs-relay nostr-rs-relay-2
pnpm exec playwright test e2e/v1-preview.spec.ts
```

**変異検証を 1 つだけ行う: コアレッサの `request()` を no-op にすると、主張 3（名前が出る）が落ちること。** 通ったら戻して `git diff src/` が空であることを確認する。

- [ ] **Step 4: 仕様 10 節の問いに答える**

**これがこのスライスの本当の成果物である。** `docs/design/read-layer-followups.md` に節を作り、実物で分かったことを書く:

1. `{ items, status, loadMore }` で足りたか。足りなければ何が要ったか
2. 30 接続予算は 3 カラム + プロフィール + 投稿で成立したか（実測値を書く）
3. 楽観的挿入は 100ms 予算に収まったか
4. `status.incomplete` の生の数値は、作った本人が見て意味が分かったか
5. fetch-once をどこまで一般化する必要が見えたか

**推測を書かないこと。** 実際に動かして分かったことだけを書き、分からなかったものは「分からなかった」と書く。

- [ ] **Step 5: ADR を更新する**

**ADR-0003 / ADR-0013 / ADR-0017** —— このスライスでは薄い版を作り、**一般形はまだ実装していない**ことを記録する。**撤回ではない。**

**ADR-0002** —— 仕様 0 節の区別を追記する。この ADR が決めているのは**本番切替の戦略**（`streets.eyemono.moe` に未完成の v1 を出さない）であって、**開発の順序ではない**。内部ルート `/v1-preview` で縦断スライスを動かすことは ADR-0002 と両立する、と明記すること。この区別が無いと、次に順序を考える人が「ADR-0002 があるから横に積むしかない」と誤読する —— **実際にこのプロジェクトはその誤読の下で 201 コミット進んだ。**

- [ ] **Step 6: 検査を通してコミットする**

```bash
pnpm exec vitest run && pnpm typecheck && pnpm check
pnpm exec playwright test --grep-invert "repost parser warning flood"
git add e2e/ docs/
git commit -m "test(e2e): cover the vertical slice, and record what it pushed back"
```

---

## 完了条件

- `pnpm exec vitest run` / `pnpm typecheck` / `pnpm check` 全通過
- `pnpm exec playwright test --grep-invert "repost parser warning flood"` 全通過
- **自分の鍵で `/v1-preview` にログインし、自分のタイムラインが出て、投稿できる**
- 仕様 10 節の 5 つの問いに、実物に基づく答えが followups に書かれている
