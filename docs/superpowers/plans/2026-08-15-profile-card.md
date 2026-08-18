# プロフィールカードとホバー 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kind:0 を面として見せるプロフィールカードを作り、ノートの著者名とアバターのホバーで出す。あわせて本文中のイベント参照をその位置に埋め込む。

**Architecture:** 取得経路は増やさない —— カードは著者名・アイコンと同じ `useProfileData` を呼ぶだけ。`about` は本文と同じトークナイザで描くので、`NoteContent` の受け取る形を「イベント」から「本文 + タグ」へ変えて共有する。ホバーの土台は `@ark-ui/solid` の `HoverCard`。

**Tech Stack:** SolidJS / TypeScript / UnoCSS / vitest / Playwright / `@ark-ui/solid`

**Spec:** [docs/superpowers/specs/2026-08-15-profile-card-design.md](../specs/2026-08-15-profile-card-design.md)。**タスクの記述と仕様が食い違ったら仕様が正。**

## Global Constraints

- コメントは**非自明な WHY だけ**。WHAT・変更履歴・タスク ID・レビュー ID は書かない。経緯は ADR か `docs/design/read-layer-followups.md` へ。
- **3 ゲートすべてが通ることが各タスクの完了条件**: `pnpm vitest run`（全件）/ `pnpm typecheck` / `pnpm check`。**各コマンドの終了ステータスをそれ自体で確認する**（`cmd >/dev/null 2>&1 && echo OK || echo NG`）。`pnpm check` は型検査を含まない。
- テストは**捕まえる変異を名指しし、実際にその変異で落ちること**を確認する。変異の前に製品コードをコピーして保存し、検証後はコピーから戻す。`git checkout` は使わない。
- 押しても何も起きない要素に `cursor-pointer` / `hover:underline` を付けない（ADR-0026。「まだ無い」と「壊れている」を区別できなくするため）。
- 外部リンクは `target="_blank" rel="noopener noreferrer"`。`http:` / `https:` 以外は `<a>` にしない。
- jsdom は CSS を評価しない。クラスの有無を主張するテストは**単語境界の正規表現**で書く（クラス文字列全体の一致にしない）。

---

## ファイル構成

| ファイル | 責務 | タスク |
|---|---|---|
| `package.json` / `pnpm-lock.yaml` | `@ark-ui/solid` を 5.38.1 へ | 1 |
| `docs/adr/0028-ark-ui-for-v1-ui-primitives.md` | v1 の UI プリミティブの決定 | 1 |
| `src/routes/v1/profile-data.ts` | kind:0 の `content` から 7 フィールドを取り出し、イベントのタグを載せる | 2 |
| `src/core/nostr/content.ts` | `parseContent` が本文 + タグを受け取る | 3 |
| `src/core/nostr/event-refs.ts` | `tagOnlyQuoteTargets`（`contentQuoteTargets` を置き換え） | 4 |
| `src/routes/v1/NoteContent.tsx` | 本文 + タグを描く。`eventRefs` でイベント参照の描き方が決まる | 3, 4 |
| `src/routes/v1/renderers/Note.tsx` | `NoteBody` が `variant` から `eventRefs` を決める。最下部の引用は `q` タグのみ | 3, 4 |
| `src/routes/v1/npub-label.ts` | 名前が無いときの短縮 npub（`Profile.tsx` から切り出し） | 5 |
| `src/routes/v1/ProfileCard.tsx` | kind:0 を面として描く | 5 |
| `src/routes/v1/ProfileHover.tsx` | 任意の要素をトリガーにしてカードを出す | 6 |
| `src/routes/v1/Avatar.tsx` | トリガーを**自分の要素に合流**させる（`sticky` を壊さない） | 6 |
| `e2e/fixtures/seed-preview.ts` / `e2e/v1.spec.ts` | ホバーで出ることの実測 | 7 |
| `docs/design/read-layer-followups.md` | 仕様 10 節の 3 問と繰り越し | 7 |

---

### Task 1: `@ark-ui/solid` を 5.38.1 へ上げ、ADR-0028 を書く

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Modify（壊れた場合のみ）: `src/features/CreatePost/components/PostInput.tsx`
- Create: `docs/adr/0028-ark-ui-for-v1-ui-primitives.md`

**Interfaces:**
- Produces: `@ark-ui/solid` 5.x が使えること。`HoverCard`（`Root` / `Trigger` / `Positioner` / `Content`）と、`asChild` の呼び出し形。

**なぜ最初にやるか。** 使い始めてから上げると、書いたばかりのコードを移行することになる（仕様 6 節）。

- [ ] **Step 1: 上げる**

```bash
pnpm add @ark-ui/solid@5.38.1
```

- [ ] **Step 2: 4 つとも通ることを確かめる**

```bash
pnpm vitest run >/dev/null 2>&1 && echo VITEST_OK || echo VITEST_NG
pnpm typecheck >/dev/null 2>&1 && echo TYPECHECK_OK || echo TYPECHECK_NG
pnpm check >/dev/null 2>&1 && echo CHECK_OK || echo CHECK_NG
pnpm build >/dev/null 2>&1 && echo BUILD_OK || echo BUILD_NG
```

リポジトリ内で 4.x を使っているのは `src/features/CreatePost/components/PostInput.tsx` の `FileUpload` / `useFileUpload` **1 箇所だけ**（v0 のコード）。落ちたらそこを最小限に直す。**v0 を作り直さない** —— 型が通り、既存のテストが通る形にするだけでよい。

- [ ] **Step 3: `asChild` の形を確かめて報告する**

Task 6 のコードがこの形に依存している。5.x でも同じか確かめる:

```bash
cat node_modules/@ark-ui/solid/dist/components/factory.d.ts
```

4.10.1 では `asChild?: (props: ParentProps<T>) => JSX.Element` で、`ParentProps` は `(userProps?) => JSX.HTMLAttributes<any>` —— つまり **`asChild` は関数を受け取り、その引数もまた関数**である:

```tsx
<HoverCard.Trigger asChild={(triggerProps) => <div {...triggerProps()} />} />
```

**5.x でこの形が変わっていたら、実際の形を報告に書くこと。** Task 6 はこの形でコードを書く。

- [ ] **Step 4: ADR-0028 を書く**

`docs/adr/0028-ark-ui-for-v1-ui-primitives.md` を作る。**既存の ADR（`docs/adr/0026-*.md` など）の書式に合わせること** —— タイトル・ステータス・日付・文脈・決定・理由・影響、という並び。中身は次を含める:

- **決定**: v1 の UI プリミティブ（ホバーカード、ダイアログ、メニュー、ポップオーバー等）は `@ark-ui/solid` を使う
- **文脈**: v0 は `@kobalte/core` を使っており、両方が依存に入っている。次にダイアログを作る人がどちらを選ぶか迷う
- **理由**: 保守が続いており、ヘッドレスで UnoCSS のスタイリングを妨げない
- **射程**: v1 のみ。v0 は #253 で消えるので `@kobalte/core` は移行しない
- **[ADR-0020](0020-no-nostr-library-noble-primitives-only.md) との関係**: あちらが自前実装を求めているのは **Nostr プロトコルの実装だけ**で、UI ライブラリはその射程外

- [ ] **Step 5: コミット**

```bash
git add package.json pnpm-lock.yaml docs/adr/0028-ark-ui-for-v1-ui-primitives.md
git commit -m "build: move v1 UI primitives to ark-ui 5"
```

---

### Task 2: kind:0 から `about` / `banner` / `nip05` / `website` とタグを読む

**Files:**
- Modify: `src/routes/v1/profile-data.ts`
- Create: `src/routes/v1/profile-data.test.ts`

**Interfaces:**
- Produces:
```ts
export type ParsedProfile = {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  banner?: string;
  nip05?: string;
  website?: string;
  /**
   * kind:0 イベントのタグ。`about` のカスタム絵文字 (NIP-30) を引くために
   * 要る —— `content` だけでは `:shortcode:` を絵文字に変換できない。
   */
  tags?: readonly string[][];
};
```

**既存の作りをそのまま延長する。** リレー由来の値なので、型が文字列でなければ例外を投げず `undefined` へ倒す。

**`parseProfileContent` には今テストが 1 件も無い。** テストファイルごと新規に作り、既存の 3 フィールド (`name` / `display_name` / `picture`) と壊れた入力の扱いも一緒に固定する —— このタスクが触る関数なので、ここで網を張る。

- [ ] **Step 1: 失敗するテストを書く**

`src/routes/v1/profile-data.test.ts` を新規に作る。

```ts
import { describe, expect, it } from "vitest";
import { parseProfileContent } from "./profile-data";

describe("parseProfileContent", () => {
  it("name / display_name / picture を取り出す", () => {
    // 捕まえる変異: NIP-24 の snake_case (`display_name`) を camelCase で
    // 読む。JSON のキーは snake_case なので、読み替えを外すと表示名が
    // 永久に undefined になる。
    const parsed = parseProfileContent(
      JSON.stringify({
        name: "alice",
        display_name: "Alice",
        picture: "https://example.com/a.png",
      }),
    );

    expect(parsed?.name).toBe("alice");
    expect(parsed?.displayName).toBe("Alice");
    expect(parsed?.picture).toBe("https://example.com/a.png");
  });

  it("JSON として壊れていれば undefined を返し、投げない", () => {
    // 捕まえる変異: try/catch を外す。kind:0 の content はリレー由来の
    // 任意文字列であり、投げるとカラム全体が落ちる。
    expect(() => parseProfileContent("{壊れている")).not.toThrow();
    expect(parseProfileContent("{壊れている")).toBeUndefined();
  });

  it("オブジェクトでない JSON は undefined", () => {
    // 捕まえる変異: typeof の判定を外す。`"文字列"` や `null` は
    // JSON.parse を通るが、その後の record 参照で落ちる。
    expect(parseProfileContent('"just a string"')).toBeUndefined();
    expect(parseProfileContent("null")).toBeUndefined();
  });
});
```

同じ `describe` の中へ、このタスクが足す分を書く。

```ts
  it("about / banner / nip05 / website を取り出す", () => {
    // 捕まえる変異: 4 つのうちどれかを読まない (カードのその行が永久に出ない)
    const parsed = parseProfileContent(
      JSON.stringify({
        about: "自己紹介",
        banner: "https://example.com/banner.png",
        nip05: "alice@example.com",
        website: "https://example.com",
      }),
    );

    expect(parsed?.about).toBe("自己紹介");
    expect(parsed?.banner).toBe("https://example.com/banner.png");
    expect(parsed?.nip05).toBe("alice@example.com");
    expect(parsed?.website).toBe("https://example.com");
  });

  it("文字列でないフィールドは undefined", () => {
    // 捕まえる変異: typeof の判定を外して値をそのまま入れる。kind:0 は
    // リレー由来の任意の JSON であり、数値やオブジェクトが入っていると
    // <img src={{}}> のような描画へそのまま流れる。
    const parsed = parseProfileContent(
      JSON.stringify({
        about: 42,
        banner: { url: "x" },
        nip05: null,
        website: ["https://example.com"],
      }),
    );

    expect(parsed?.about).toBeUndefined();
    expect(parsed?.banner).toBeUndefined();
    expect(parsed?.nip05).toBeUndefined();
    expect(parsed?.website).toBeUndefined();
  });
```

- [ ] **Step 2: 走らせて落ちることを確認**

Run: `pnpm vitest run src/routes/v1/profile-data.test.ts`
Expected: FAIL（`parsed.about` が `undefined`）

- [ ] **Step 3: 実装**

`ParsedProfile` に 4 つ足し、`parseProfileContent` の戻り値に 4 行足す。

```ts
    about: typeof record.about === "string" ? record.about : undefined,
    banner: typeof record.banner === "string" ? record.banner : undefined,
    nip05: typeof record.nip05 === "string" ? record.nip05 : undefined,
    website: typeof record.website === "string" ? record.website : undefined,
```

`tags` は `content` のパース結果ではなく**イベントのタグ**なので、`parseProfileContent` ではなく `useProfileData` が載せる。同ファイルの `check()` の中:

```ts
    const check = (): boolean => {
      const event = store.latestReplaceable(0, key);
      if (!event) return false;
      const parsed = parseProfileContent(event.content);
      // `about` のカスタム絵文字 (NIP-30) を引くのに kind:0 の `emoji`
      // タグが要る。`content` のパース結果には含まれないので、ここで
      // イベント側から載せる。
      setProfile(parsed ? { ...parsed, tags: event.tags } : undefined);
      return true;
    };
```

- [ ] **Step 4: ゲートと変異検証、コミット**

変異は 5 件（Step 1 の 3 件、Step 3 の「フィールドを読まない」「`typeof` の判定を外す」）。`tags` は Task 5 のカードのテスト（`about` のカスタム絵文字）が捕まえるので、ここでは主張しない。

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git commit -m "feat(v1): read the rest of a kind:0 profile"
```

---

### Task 3: `parseContent` と `NoteContent` が「本文 + タグ」を受け取る

**Files:**
- Modify: `src/core/nostr/content.ts`
- Modify: `src/core/nostr/content.test.ts`
- Modify: `src/core/nostr/event-refs.ts`
- Modify: `src/routes/v1/NoteContent.tsx`
- Modify: `src/routes/v1/NoteContent.test.tsx`
- Modify: `src/routes/v1/renderers/Note.tsx`

**Interfaces:**
- Produces:
  - `parseContent(content: string, tags: readonly string[][]): ContentToken[]`
  - `NoteContentProps = { content: string; tags: readonly string[][]; variant: EventVariant }`

**このタスクは挙動を一切変えない。** 受け取る形だけを変える。`about`（イベントではない文字列）を同じトークナイザへ通せるようにするのが目的（仕様 4 節）。

**名前を増やさない。** `parseContent(event)` を残したまま文字列版を足すと、同じことをする関数が 2 つ並ぶ。`parseContent` 自体の引数を変え、呼び出し側 2 箇所（`event-refs.ts` と `NoteContent.tsx`）が `event.content, event.tags` を渡す。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/nostr/content.test.ts` は今 `noteWith(content, tags)` のようなヘルパでイベントを作って `parseContent(event)` を呼んでいる。**ヘルパは残したまま**、`parseContent` の呼び出しを `parseContent(event.content, event.tags)` に置き換える。加えて 1 件足す:

```ts
  it("イベントを組み立てずに本文とタグだけで呼べる", () => {
    // 捕まえる変異: 引数をイベントに戻す。プロフィールの about は
    // イベントではない文字列なので、イベントを要求すると呼べない。
    const tokens = parseContent(":happy: と https://example.com/", [
      ["emoji", "happy", "https://cdn.example/happy.png"],
    ]);

    expect(tokens[0]).toEqual({
      type: "emoji",
      shortcode: "happy",
      url: "https://cdn.example/happy.png",
    });
    expect(tokens.some((t) => t.type === "url")).toBe(true);
  });
```

- [ ] **Step 2: 走らせて落ちることを確認**

Run: `pnpm vitest run src/core/nostr/content.test.ts`
Expected: FAIL（型エラー、または `content.length` の読み取りで落ちる）

- [ ] **Step 3: `parseContent` の引数を変える**

`src/core/nostr/content.ts`:

```ts
export const parseContent = (
  content: string,
  tags: readonly string[][],
): ContentToken[] => {
  if (content === "") return [];

  const emojiIndex = buildEmojiIndex(tags);
```

以降の本体は変えない（`event.content` を参照していた箇所は既にローカルの `content` を使っている）。`NostrEvent` の import が未使用になったら消す。

- [ ] **Step 4: 呼び出し側 2 箇所を直す**

`src/core/nostr/event-refs.ts` の `contentQuoteTargets` の中:

```ts
  for (const token of parseContent(event.content, event.tags)) {
```

`src/routes/v1/NoteContent.tsx`:

```ts
export type NoteContentProps = {
  content: string;
  tags: readonly string[][];
  variant: EventVariant;
};
```

```ts
const NoteContent: Component<NoteContentProps> = (props) => {
  const tokens = createMemo(() => parseContent(props.content, props.tags));
```

`src/routes/v1/renderers/Note.tsx` の `NoteBody` の中（1 箇所）:

```tsx
              <NoteContent
                content={props.event.content}
                tags={props.event.tags}
                variant={props.variant}
              />
```

- [ ] **Step 5: ゲート、コミット**

変異は 1 件（引数をイベントに戻す）。既存のテストが全部通ることが「挙動を変えていない」ことの主張である。

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git commit -m "refactor: tokenize content and tags, not an event"
```

---

### Task 4: `eventRefs` と、引用の置き場所

**Files:**
- Modify: `src/core/nostr/event-refs.ts`（`contentQuoteTargets` → `tagOnlyQuoteTargets`）
- Modify: `src/core/nostr/event-refs.test.ts`
- Modify: `src/routes/v1/NoteContent.tsx`
- Modify: `src/routes/v1/NoteContent.test.tsx`
- Modify: `src/routes/v1/renderers/Note.tsx`
- Modify: `src/routes/v1/renderers/Note.test.tsx`

**Interfaces:**
- Consumes: `parseContent(content, tags)`（Task 3）
- Produces:
  - `tagOnlyQuoteTargets(event: NostrEvent): EventRef[]`
  - `NoteContentProps` に `eventRefs: "text" | "embed"` が加わる

**仕様 4.1 / 4.2 節がすべて。** 本文に現れた引用は**その位置**に、`q` タグにしかない引用は**最下部**に。同じイベントが 2 回描かれないことがこの分割の要点。

- [ ] **Step 1: `tagOnlyQuoteTargets` の失敗するテストを書く**

`src/core/nostr/event-refs.test.ts` に。既存の `contentQuoteTargets` のテストは**消す**（関数ごと置き換わるため）。

```ts
describe("tagOnlyQuoteTargets", () => {
  it("本文に出てこない q タグだけを返す", () => {
    // 捕まえる変異: 本文の言及を引かずに q タグを全部返す。本文の位置に
    // 埋め込んだ引用が最下部にもう一度出て、同じイベントが 2 回描かれる。
    const inBody = "a".repeat(64);
    const tagOnly = "b".repeat(64);
    const event = noteWith(`見て nostr:${encodeBech32("note", inBody)}`, [
      ["q", inBody],
      ["q", tagOnly],
    ]);

    expect(tagOnlyQuoteTargets(event)).toEqual([
      { form: "id", id: tagOnly },
    ]);
  });

  it("本文にしかない引用は返さない", () => {
    // 捕まえる変異: 本文の言及も足して返す。本文側は MentionToken が
    // その位置に描くので、ここで返すと二重になる。
    const inBody = "c".repeat(64);
    const event = noteWith(`nostr:${encodeBech32("note", inBody)}`, []);

    expect(tagOnlyQuoteTargets(event)).toEqual([]);
  });

  it("q タグの座標形式は本文と突き合わせずに残す", () => {
    // 捕まえる変異: address 形式を落とす。本文の nostr: は id しか
    // 運ばないので突き合わせようがなく、落とすと naddr の引用が消える。
    const event = noteWith("本文", [["q", "30023:abc:slug"]]);

    expect(tagOnlyQuoteTargets(event)).toEqual([
      { form: "address", address: "30023:abc:slug" },
    ]);
  });
});
```

**`noteWith` と `encodeBech32` は既に `event-refs.test.ts` が使っているものを使う。** 新しいヘルパを作らない。

- [ ] **Step 2: `tagOnlyQuoteTargets` を実装する**

`src/core/nostr/event-refs.ts` の `contentQuoteTargets` を**丸ごと置き換える**（関数を 2 つ残さない）。

```ts
/**
 * `q` タグのうち、**本文に `nostr:` として現れないもの**。
 *
 * 本文に現れた引用はその位置に埋め込むので (`NoteContent` の `eventRefs`)、
 * ここで返すと同じイベントが 2 回描かれる。[NIP-18] は本文の言及を `q`
 * タグへ変換することを MUST としているが、[NIP-27] は `q` タグを任意と
 * しており、両者は食い違っている —— 本文とタグは両方向にずれうるので、
 * 「タグにしか無いもの」を最下部に出すことで、どちらのクライアントの
 * 投稿でも引用を落とさない。
 *
 * 座標形式 (`form: "address"`) は本文の `nostr:` が運ぶ id と突き合わせ
 * られないので、常に残す。
 */
export const tagOnlyQuoteTargets = (event: NostrEvent): EventRef[] => {
  const mentioned = new Set<string>();
  for (const token of parseContent(event.content, event.tags)) {
    if (token.type !== "mention") continue;
    const ref = token.ref;
    if (ref.kind === "note" || ref.kind === "nevent") mentioned.add(ref.id);
  }
  return quoteTargets(event).filter(
    (ref) => ref.form !== "id" || !mentioned.has(ref.id),
  );
};
```

- [ ] **Step 3: `NoteContent` に `eventRefs` を足す**

```ts
export type NoteContentProps = {
  content: string;
  tags: readonly string[][];
  variant: EventVariant;
  /**
   * イベントへの参照 (`note`/`nevent`/`naddr`) をどう描くか。**省略可能に
   * しない** —— 決めずに書けると、本文の `nostr:note` が黙って消えて文が
   * 途中で切れる形が再発する。
   */
  eventRefs: "text" | "embed";
};
```

`MentionToken` を書き換える:

```tsx
/**
 * `npub`/`nprofile` は名前解決 (`<Profile>` が担う)。
 *
 * イベントへの参照は `eventRefs` で決まる (仕様 4.1 節):
 * `"embed"` はその位置に対象を `compact` で描き、`"text"` は短縮した
 * テキストで残す。**捨てる選択肢は無い** —— 捨てると「この投稿
 * nostr:note1… が面白い」のような文が途中で切れる。
 *
 * `naddr` は座標 (kind:pubkey:d) の解決経路がまだ無いので `"embed"` でも
 * 埋め込めない。落として本文を欠けさせるのではなく固定文言を残す。
 */
const MentionToken: Component<{
  mention: Nip19Ref;
  raw: string;
  eventRefs: "text" | "embed";
}> = (props) => {
  const ctx = useRender();
  // "ref" という prop 名は Solid の JSX で特別扱いされうるので避ける
  // (ネイティブ要素の DOM ref 転送と紛らわしい)。
  const ref = props.mention;

  switch (ref.kind) {
    case "npub":
    case "nprofile":
      return (
        <Profile
          pubkey={ref.pubkey}
          store={ctx.store}
          requests={ctx.profiles}
        />
      );
    case "note":
    case "nevent":
      return (
        <Show
          when={props.eventRefs === "embed"}
          fallback={<EventRefText raw={props.raw} />}
        >
          <EventView
            id={ref.id}
            variant="compact"
            relayHint={ref.kind === "nevent" ? relayOf(ref.relays[0]) : undefined}
          />
        </Show>
      );
    case "naddr":
      return (
        <Show
          when={props.eventRefs === "embed"}
          fallback={<EventRefText raw={props.raw} />}
        >
          <span data-testid="unsupported-ref" class="c-secondary text-caption">
            未対応の参照です
          </span>
        </Show>
      );
  }
};
```

短縮テキストの部品を同じファイルへ足す:

```tsx
/**
 * イベント参照を短縮したテキスト。`nostr:` を落として bech32 の先頭 12 桁
 * だけを見せる —— 60 桁を丸ごと出すと、`about` のような狭い枠では本文が
 * それだけで埋まる。元の文字列は `title` で丸ごと読める。
 *
 * **押せそうには見せない** (ADR-0026)。押して開く先のカラムがまだ無い。
 */
const EventRefText: Component<{ raw: string }> = (props) => {
  const label = () => {
    const entity = props.raw.replace(/^nostr:/, "");
    return entity.length > 12 ? `${entity.slice(0, 12)}…` : entity;
  };

  return (
    <span data-testid="event-ref-text" class="c-secondary" title={props.raw}>
      {label()}
    </span>
  );
};
```

`Token` と `NoteContent` に `eventRefs` を通す:

```tsx
const Token: Component<{
  token: ContentToken;
  variant: EventVariant;
  eventRefs: "text" | "embed";
}> = (props) => {
```

```tsx
    case "mention":
      return (
        <MentionToken
          mention={token.ref}
          raw={token.raw}
          eventRefs={props.eventRefs}
        />
      );
```

```tsx
      <For each={tokens()}>
        {(token) => (
          <Token
            token={token}
            variant={props.variant}
            eventRefs={props.eventRefs}
          />
        )}
      </For>
```

import を足す: `EventView`（`./EventView`）と `relayOf`（`../../core/nostr/event-refs`）。**`relayOf` は今 `event-refs.ts` の中で `const relayOf = …` として閉じているので、`export` を付ける。** リレーヒントの正規化 (`RelayUrl` への変換) を `NoteContent` 側で書き直すと、同じ規則が 2 箇所に増える。

- [ ] **Step 4: `NoteBody` で `eventRefs` を決める**

`src/routes/v1/renderers/Note.tsx` の `NoteBody`（`NoteContent` を描いている唯一の場所）:

```tsx
              <NoteContent
                content={props.event.content}
                tags={props.event.tags}
                variant={props.variant}
                // full は本文の位置に埋め込む (仕様 4.2 節)。compact は
                // 関連イベントを一切要求しないという規則があるので、
                // 埋め込まずテキストにする。
                eventRefs={props.variant === "full" ? "embed" : "text"}
              />
```

- [ ] **Step 5: `NoteFull` の最下部を `q` タグだけにする**

```tsx
  // 本文に `nostr:` として現れた引用は `NoteContent` がその位置に描く
  // (仕様 4.2 節)。ここに残るのは **タグにしか無いもの** だけ。
  const quotes = () => tagOnlyQuoteTargets(props.event);
```

import から `quoteTargets` / `contentQuoteTargets` を外し、`tagOnlyQuoteTargets` を入れる。

- [ ] **Step 6: コンポーネントのテストを書く**

`src/routes/v1/NoteContent.test.tsx` に足す（既存の `mount` / `contextWith` の作法に従う）。

| 主張 | 捕まえる変異 |
|---|---|
| `eventRefs="text"` で `note` が `event-ref-text` になり、`title` に元の `nostr:` 文字列が入る | 短縮せず全部出す / `title` を付けない |
| `eventRefs="text"` で `naddr` も `event-ref-text` になる | `naddr` だけ「未対応の参照です」のままにする |
| `eventRefs="embed"` で `note` が `compact` の `event-view` になる | `text` のまま出す |
| `eventRefs="embed"` でも `naddr` は「未対応の参照です」 | `naddr` を埋め込もうとする |

`src/routes/v1/renderers/Note.test.tsx` に足す。

| 主張 | 捕まえる変異 |
|---|---|
| **本文に現れた引用が本文の中に出て、最下部（`NestedEventCard` の中）には出ない** | `quotes()` を `quoteTargets` に戻す（同じイベントが 2 回出る） |
| `q` タグにしか無い引用が最下部に出る | `tagOnlyQuoteTargets` を空配列にする |
| **`NoteCompact` の本文では埋め込まれずテキストになる** | `NoteBody` の三項を `"embed"` 固定にする（compact の規則が壊れる） |

- [ ] **Step 7: ゲートと変異検証、コミット**

変異は 10 件（Step 1 の 3 件、Step 6 の 7 件）。

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git commit -m "feat(v1): draw a quote where the body mentions it"
```

---

### Task 5: `ProfileCard`

**Files:**
- Create: `src/routes/v1/npub-label.ts`
- Create: `src/routes/v1/npub-label.test.ts`
- Modify: `src/routes/v1/Profile.tsx`（`fallbackLabel` を切り出して import）
- Create: `src/routes/v1/ProfileCard.tsx`
- Create: `src/routes/v1/ProfileCard.test.tsx`

**Interfaces:**
- Consumes: `ParsedProfile`（Task 2）、`NoteContentProps`（Task 3/4）
- Produces:
  - `npubLabel(pubkey: string): string`
  - `ProfileCard: Component<{ pubkey: string }>`（default export）

**仕様 3 節がすべて。** v0 の `src/features/User/components/Profile.tsx` の縦の並びを写す。**フォローボタン・フォロー数・フォロワー数・NIP-05 の検証は作らない**（仕様 2 節）。

- [ ] **Step 1: `npubLabel` を切り出す**

`src/routes/v1/Profile.tsx` の `fallbackLabel` をそのまま `src/routes/v1/npub-label.ts` へ移し、`npubLabel` として輸出する。`Profile.tsx` は import して使う（**同じ規則を 2 箇所に書かない**）。

```ts
import { encodeBech32 } from "../../core/nostr/nip19";

/**
 * 名前が無いときに人物を指す文字列。`encodeBech32` は 64 桁 hex 以外で
 * 投げるが、pubkey は NIP-10 の `e` タグ 5 番目の要素など**リレー由来の
 * 任意文字列**から来ることがある —— 投げさせるとカラム全体が落ちる
 * (`<For>` の周りに ErrorBoundary が無い) ので、hex として読めない値は
 * 短縮 hex のまま出す。
 */
export const npubLabel = (pubkey: string): string => {
  try {
    return encodeBech32("npub", pubkey).slice(0, 12);
  } catch {
    return `${pubkey.slice(0, 8)}…`;
  }
};
```

テスト（`npub-label.test.ts`）:

```ts
import { describe, expect, it } from "vitest";
import { npubLabel } from "./npub-label";

describe("npubLabel", () => {
  it("64 桁 hex は npub の先頭 12 文字", () => {
    // 捕まえる変異: slice を外して npub を丸ごと返す (63 文字が名前の
    // 位置に出て、行が崩れる)
    expect(npubLabel("a".repeat(64))).toBe("npub1424242");
  });

  it("hex として読めない値でも投げない", () => {
    // 捕まえる変異: try/catch を外す。pubkey はリレー由来の任意文字列
    // から来ることがあり、投げるとカラム全体が落ちる。
    expect(() => npubLabel("not-a-hex")).not.toThrow();
    expect(npubLabel("not-a-hex")).toBe("not-a-h…");
  });
});
```

**`npubLabel("a".repeat(64))` の期待値は実際に走らせて確かめること。** 手計算では出せない（bech32 のチェックサム）。`Profile.tsx` の既存テストに同じ値があればそれを使う。

- [ ] **Step 2: `ProfileCard` の失敗するテストを書く**

`src/routes/v1/ProfileCard.test.tsx`。**`src/routes/v1/renderers/Note.test.tsx` の `mount` / `contextWith` / `signed` の作法をそのまま真似ること。** kind:0 は `EventStore` へ直接 `put` して用意する（実署名が要る。`event-store.test.ts` の `sign()` を真似る）。

| 主張 | 捕まえる変異 |
|---|---|
| kind:0 が無くても短縮 npub で描かれる | 未取得のとき何も描かない（ホバーしても空の枠が出る） |
| `display_name` と `@name` が両方出る | どちらか片方しか出さない |
| `about` のカスタム絵文字が `<img data-testid="content-emoji">` になる | `about` を素のテキストで出す（**v0 が取りこぼしている点**。仕様 1 節） |
| `about` の `nostr:note` が `event-ref-text` として残る | `eventRefs="embed"` を渡す（カードの中に引用カードが生える） |
| `website` が `javascript:` のとき `<a>` にならない | scheme を確かめずリンクにする |
| `nip05` が無ければ NIP-05 の行を出さない | 常に行を出す（空のアイコンだけが並ぶ） |
| **検証済みバッジ（`i-material-symbols:verified-rounded`）を出さない** | 検証していないのに検証済みの見た目にする |

- [ ] **Step 3: `ProfileCard` を書く**

```tsx
import { type Component, Show, createSignal } from "solid-js";
import { useRender } from "../../core/view/render-context";
import NoteContent from "./NoteContent";
import { npubLabel } from "./npub-label";
import { useProfileData } from "./profile-data";

/** `nip05` の表示はドメイン部分だけ (v0 の `Nip05Badge` と同じ)。 */
const nip05Domain = (nip05: string): string | undefined => {
  const at = nip05.lastIndexOf("@");
  return at >= 0 ? nip05.slice(at + 1) : undefined;
};

/** `javascript:` などを踏ませない。`http(s)` 以外はリンクにしない。 */
const isHttpUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * kind:0 を面として描く (仕様 3 節)。v0 の
 * `features/User/components/Profile.tsx` の縦の並びを写す。
 *
 * **取得経路を増やさない。** ここが出す情報はすべて kind:0 の中にあり、
 * 著者名 (`<Profile>`) とアイコン (`<Avatar>`) が既に同じ kind:0 を
 * `useProfileData` 経由で要求している。ホバーしたから増える通信は無い。
 *
 * 寸法は v0 の `small` 相当 1 つだけ。#205 が大きいほうを要ったときに
 * そこで足す —— 使われないモードを先に書くと、実際に使う日まで誰も
 * 正しさを確かめられない。
 */
const ProfileCard: Component<{ pubkey: string }> = (props) => {
  const ctx = useRender();
  const profile = useProfileData(() => props.pubkey, ctx.store, ctx.profiles);
  const [bannerBroken, setBannerBroken] = createSignal(false);
  const [pictureBroken, setPictureBroken] = createSignal(false);

  const displayName = () =>
    profile()?.displayName || profile()?.name || npubLabel(props.pubkey);
  const domain = () => {
    const nip05 = profile()?.nip05;
    return nip05 ? nip05Domain(nip05) : undefined;
  };
  const website = () => {
    const url = profile()?.website;
    return url && isHttpUrl(url) ? url : undefined;
  };

  return (
    <div
      data-testid="profile-card"
      class="grid h-full max-h-inherit grid-rows-[auto_minmax(0,1fr)]"
    >
      {/*
        画像が落ちても枠は残す (`Avatar` と同じ判断) —— 枠が消えると
        カードの高さが後から縮み、下の行が飛ぶ。
      */}
      <div class="mb--16 max-h-24 w-full select-none overflow-hidden bg-secondary">
        <Show when={profile()?.banner && !bannerBroken()}>
          <img
            data-testid="profile-banner"
            src={profile()?.banner}
            alt=""
            loading="lazy"
            class="h-full w-full object-cover"
            onError={() => setBannerBroken(true)}
          />
        </Show>
      </div>

      <div class="flex w-full flex-col gap-1 overflow-hidden p-2">
        <div class="relative mt-24">
          <div class="absolute bottom-0 aspect-square h-24 w-auto shrink-0 select-none overflow-hidden rounded bg-secondary">
            <Show when={profile()?.picture && !pictureBroken()}>
              <img
                data-testid="profile-picture"
                src={profile()?.picture}
                alt=""
                loading="lazy"
                class="h-full w-full object-cover"
                onError={() => setPictureBroken(true)}
              />
            </Show>
          </div>
        </div>

        <div class="flex flex-col">
          <span
            data-testid="profile-card-name"
            class="line-clamp-3 text-ellipsis font-700 text-h3"
          >
            {displayName()}
          </span>
          <Show when={profile()?.name}>
            {(name) => (
              <span class="c-secondary truncate text-caption">@{name()}</span>
            )}
          </Show>
        </div>

        <div class="flex w-full flex-wrap gap-2">
          {/*
            **検証していないので検証済みの見た目にしない** (仕様 3.1 節)。
            v0 が検証前に出しているのと同じ「未検証」の印を出す。
          */}
          <Show when={domain()}>
            {(value) => (
              <div data-testid="profile-nip05" class="flex items-center gap-1">
                <div class="i-material-symbols:question-mark-rounded c-secondary aspect-square h-0.75lh w-auto" />
                <div class="c-secondary text-caption">{value()}</div>
              </div>
            )}
          </Show>
          <Show when={website()}>
            {(url) => (
              <div class="flex max-w-full items-center gap-1">
                <div class="i-material-symbols:link-rounded c-secondary aspect-square h-0.75lh w-auto" />
                <a
                  data-testid="profile-website"
                  href={url()}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="truncate text-caption text-link"
                >
                  {url()}
                </a>
              </div>
            )}
          </Show>
        </div>

        {/*
          `about` は本文と同じトークナイザで描く —— NIP-30 のカスタム絵文字は
          kind:0 の `name`/`about` にも適用される (v0 はタグを捨てていて
          効いていない)。`compact` なので画像はインライン展開しない。
          イベント参照はテキストで残す —— カードに引用カードを生やすと
          360px の枠が他人のノートで埋まる。
        */}
        <Show when={profile()?.about}>
          {(about) => (
            <div class="overflow-y-auto">
              <NoteContent
                content={about()}
                tags={profile()?.tags ?? []}
                variant="compact"
                eventRefs="text"
              />
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};

export default ProfileCard;
```

- [ ] **Step 4: ゲートと変異検証、コミット**

変異は 9 件（Step 1 の 2 件、Step 2 の 7 件）。

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git commit -m "feat(v1): show a profile as a card"
```

---

### Task 6: `ProfileHover` と配線

**Files:**
- Create: `src/routes/v1/ProfileHover.tsx`
- Create: `src/routes/v1/ProfileHover.test.tsx`
- Modify: `src/routes/v1/Avatar.tsx`
- Modify: `src/routes/v1/Avatar.test.tsx`
- Modify: `src/routes/v1/renderers/Note.tsx`
- Modify: `src/routes/v1/renderers/Note.test.tsx`

**Interfaces:**
- Consumes: `ProfileCard`（Task 5）、`@ark-ui/solid` の `HoverCard`（Task 1）
- Produces: `ProfileHover`（`ParentComponent<{ pubkey: string }>`）と、`asChild` を使う版

**仕様 5 節がすべて。** 著者名とアバターの両方に掛ける。**本文中の言及・リポスト/リアクションの見出し・リアクション一覧の名前には掛けない** —— `<Profile>` 自体に仕込むと、カードの中の名前にもカードが出る入れ子になる。

- [ ] **Step 1: `ProfileHover` を書く**

```tsx
import { HoverCard } from "@ark-ui/solid/hover-card";
import { type JSX, type ParentComponent, Show } from "solid-js";
import { Portal } from "solid-js/web";
import ProfileCard from "./ProfileCard";

export type ProfileHoverProps = {
  pubkey: string;
  /**
   * トリガーを**既存の要素そのもの**にしたいときに渡す。`Avatar` の枠は
   * `sticky top-0` で、包む要素を挟むと `sticky` はその小さな包みの中で
   * 動くことになり効かなくなる (仕様 5.1 節)。
   */
  asChild?: (props: () => JSX.HTMLAttributes<HTMLElement>) => JSX.Element;
};

/**
 * 名前やアイコンにホバーするとプロフィールカードを出す (仕様 5 節)。
 *
 * **トリガーは押せそうに見せない** —— `cursor-pointer` も
 * `hover:underline` も付けない。押しても何も起きないため (ADR-0026)。
 * ユーザー詳細カラム (#205) が入った時点で両方を足してクリックを繋ぐ。
 */
const ProfileHover: ParentComponent<ProfileHoverProps> = (props) => (
  <HoverCard.Root>
    <Show
      when={props.asChild}
      fallback={
        <HoverCard.Trigger data-testid="profile-hover-trigger">
          {props.children}
        </HoverCard.Trigger>
      }
    >
      {(asChild) => <HoverCard.Trigger asChild={asChild()} />}
    </Show>
    <Portal>
      <HoverCard.Positioner>
        <HoverCard.Content class="b-1 max-h-[min(calc(100vh-32px),360px)] min-h-0 max-w-[min(calc(100vw-32px),360px)] overflow-hidden rounded-2 bg-primary shadow-lg">
          <ProfileCard pubkey={props.pubkey} />
        </HoverCard.Content>
      </HoverCard.Positioner>
    </Portal>
  </HoverCard.Root>
);

export default ProfileHover;
```

**`asChild` の呼び出し形は Task 1 の報告で確かめた形に合わせること。** 4.10.1 では `asChild?: (props: ParentProps<T>) => JSX.Element` で `ParentProps` 自体も関数である。5.x で変わっていたら、この型と `Avatar` 側の書き方を実際の形へ直す。

- [ ] **Step 2: `Avatar` のトリガーを自分の要素に合流させる**

`src/routes/v1/Avatar.tsx` の返り値を、既存の `<div data-testid="avatar" class="sticky top-0 …">` に `triggerProps()` を展開する形へ変える。

```tsx
  return (
    <ProfileHover
      pubkey={props.pubkey}
      asChild={(triggerProps) => (
        <div
          {...triggerProps()}
          data-testid="avatar"
          class="sticky top-0 aspect-square shrink-0 overflow-hidden rounded bg-secondary"
          classList={{
            "w-10": props.size === "full",
            "w-8": props.size === "compact",
          }}
        >
          <Show when={profile()?.picture}>
            {(picture) => (
              <img
                src={picture()}
                alt=""
                loading="lazy"
                class="h-full w-full object-cover"
              />
            )}
          </Show>
        </div>
      )}
    />
  );
```

- [ ] **Step 3: 著者名に掛ける**

`src/routes/v1/renderers/Note.tsx` の `NoteBody` の中の著者行。今はこうなっている:

```tsx
          <p data-testid="note-author" class="min-w-0 truncate">
            <Profile
              pubkey={props.event.pubkey}
              store={ctx.store}
              requests={ctx.profiles}
              variant="author"
            />
          </p>
```

`<Profile>` を `<ProfileHover>` で包む。**`<p>` の `min-w-0 truncate` はそのまま残す** —— 外側の `truncate` が効かなくなると長い表示名で著者行が折り返す。

```tsx
          <p data-testid="note-author" class="min-w-0 truncate">
            <ProfileHover pubkey={props.event.pubkey}>
              <Profile
                pubkey={props.event.pubkey}
                store={ctx.store}
                requests={ctx.profiles}
                variant="author"
              />
            </ProfileHover>
          </p>
```

**`<Profile>` 自体は変えない。** 本文中の言及・リポスト/リアクションの見出し・リアクション一覧でも使われており、そこにホバーを付けるとカードの中の名前にもカードが出る入れ子になる（仕様 5 節）。

- [ ] **Step 4: テストを書く**

| ファイル | 主張 | 捕まえる変異 |
|---|---|---|
| `Avatar.test.tsx` | **`avatar` の要素そのものがトリガーの属性を持つ**（包む要素が挟まっていない） | `asChild` をやめて `<ProfileHover>` で包む（`sticky top-0` が効かなくなる） |
| `Avatar.test.tsx` | `avatar` の要素が `sticky` と `top-0` を持ったまま | クラスを落とす |
| `ProfileHover.test.tsx` | トリガーに `cursor-pointer` / `hover:underline` が無い | 押せそうな見た目を足す |
| `Note.test.tsx` | 著者行がトリガーを持つ | ホバーを外す |
| `Note.test.tsx` | **本文中の言及（`NoteContent` の `<Profile>`）はトリガーを持たない** | `<Profile>` 自体にホバーを仕込む（カードの中の名前にもカードが出る） |

**トリガーの検出は `data-scope="hover-card"` と `data-part="trigger"`（ark-ui が付ける属性）で行う。** ark-ui が実際に付ける属性名は、テストを書く前に 1 度描画して確かめること —— 推測で書くと通らない。

- [ ] **Step 5: ゲートと変異検証、コミット**

変異は 5 件。

```bash
pnpm vitest run && pnpm typecheck && pnpm check
git commit -m "feat(v1): show the profile card on hover"
```

---

### Task 7: e2e と記録

**Files:**
- Modify: `e2e/fixtures/seed-preview.ts`
- Modify: `e2e/v1.spec.ts`
- Modify: `docs/design/read-layer-followups.md`

- [ ] **Step 1: フィクスチャの kind:0 を厚くする**

`seedPreviewFixture` の `profile()` は今 `{ name, display_name }` だけを書いている。`previewAuthorOne` の kind:0 に `about` / `banner` / `nip05` / `website` を足す。`about` には**カスタム絵文字のショートコードと `nostr:note` の参照**を入れ、kind:0 に `emoji` タグを付ける（仕様 1 節が v0 の取りこぼしとして挙げている点を実測するため）。

`about` の本文は e2e から突き合わせられるように定数として輸出する。

- [ ] **Step 2: e2e の主張を足す**

`e2e/v1.spec.ts` に新しい `test` を足す。

- 著者名にホバーすると `profile-card` が出て、`about` の本文が読める
  捕まえる変異: 著者行からホバーを外す
- **アイコンにホバーしても出る**
  捕まえる変異: `Avatar` からホバーを外す
- `about` のカスタム絵文字が `content-emoji` として出る
  捕まえる変異: `ProfileCard` が `about` を素のテキストで描く

Playwright の `hover()` を使う。ark-ui の既定の `openDelay` は 600ms なので、`expect(...).toBeVisible({ timeout: ... })` の待ち時間をそれより十分長く取る。

- [ ] **Step 3: 仕様 10 節の 3 問に答える**

`docs/design/read-layer-followups.md` に新しい節を作る。**推測を書かない。取れていないものは「未取得」と書き、何を見れば答えられるかを書く。**

- 問い 1（ホバーの開閉の遅延が v0 と揃っているか）
- 問い 2（カラムの `overflow` の中でカードが切れないか）
- 問い 3（`content-visibility: auto` の中のトリガーでホバーが効くか）

**繰り越しも書く:**
- NIP-05 を検証していないこと（常に未検証マーク）。検証は外部 HTTP という新しい経路
- フォロー操作・フォロー数・フォロワー数がカードに無いこと
- カードの寸法が 1 つしかないこと（#205 が大きいほうを要る）

- [ ] **Step 4: ゲート、コミット**

```bash
pnpm vitest run && pnpm typecheck && pnpm check
pnpm exec playwright test e2e/v1.spec.ts
git commit -m "test(v1): assert the profile card appears on hover"
```

---

## 検証

完了時に人間へ依頼すること。

1. `pnpm dev` → `/v1` を実鍵で開き、**v0（`/`）と並べてホバーカードの見た目と開閉の間合いを比べる**
2. **カラムの端（一番右のカラム、一番下のノート）でカードが切れないか**
3. **本文に引用を含むノートで、引用がリンクの位置に出ているか**。`q` タグにしか無い引用が最下部に出ているか
4. `about` の長い人・絵文字を使っている人でカードが読めるか
