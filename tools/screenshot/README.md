# スクリーンショット用の環境

宣伝用のスクリーンショットを撮るための、再現できるローカル環境。架空の人たちの投稿・返信・リアクション・リポスト・Zap・フォローを fixture（TypeScript）に書いておき、そこから署名済みの Nostr イベントを作って、手元のリレーに入れる。

- 同じシナリオと基準時刻なら、毎回まったく同じイベント（同じ id）になる
- 撮りたい画面ごとにシナリオを分ける（ホーム・通知・スレッド・プロフィール・複数カラム・画像）
- イベントはふつうの Nostr のイベントなので、Streets は本物のリレーと同じように読む
- ここのコードは `apps/web` から読まれないので、本番のビルドには入らない

## 必要なもの

- [nak](https://github.com/fiatjaf/nak)（`nak serve` と `nak bunker` を使う）

nak を使う理由は 2 つ。

1. **止めれば空に戻るリレー**：`nak serve` はメモリの上だけで動くリレーで、起動時に JSONL のイベントを読み込める。止めて立て直すだけで同じ状態に戻るので、docker のボリュームを消すような後始末が要らない
2. **鍵をブラウザに入れずにログインできる**：`nak bunker` で、架空の人の鍵を持ったリモート署名器（NIP-46）を立てる。画面では bunker:// を貼るだけでログインでき、ふだん使っている拡張機能に鍵を入れなくて済む

## 撮る

```sh
pnpm screenshot many-columns --time "2026-09-23T19:00:00+09:00"
```

リレー（`ws://localhost:10547`）・画像（`http://localhost:10548`）・署名器が立ち、次にすることが表示される。

1. 別の端末で `pnpm dev`
2. 表示された URL（`http://localhost:5173/?relays=ws://localhost:10547&screenshot`）を開く
   - `?relays=` は、開発時だけアプリの読み書き先をこのリレーに差し替える
   - `?screenshot` は、開発用のパネルと使い方の案内を写さないようにする
3. 「Nostr のアカウントを持っている方」→「リモート署名器でログイン」→「文字列を貼り付ける」に、表示された `bunker://…` を貼る

Ctrl+C でリレー・画像・署名器をまとめて止める。次に立てれば同じ状態から始まる。

**ブラウザは、撮るためだけのプロフィール（またはシークレットウィンドウ）で開く。** Streets はデッキや設定を端末（localStorage）にも覚えるので、前に撮ったシナリオの状態が残ることがある。シナリオを替えるときは、サイトのデータを消すか、新しいウィンドウで開く。

### シナリオ

| 名前 | 撮るもの |
| --- | --- |
| `home` | ホームタイムライン。いろいろな人のふだんの投稿 |
| `notifications` | 通知。返信・リアクション・リポスト・引用・メンション・Zap |
| `thread` | スレッド。ひとつの問いかけに何人かが答えている（`thread-root` の投稿を開く） |
| `profile` | プロフィール。写真を撮る haru のカラム |
| `many-columns` | 複数カラム。ホーム・通知・#coffee・#music・kai |
| `media` | 画像。写真やイラストの投稿 |

どのシナリオも、見る人（ログインする人）は `mio`。`pnpm screenshot` でシナリオを省くと `home`。

Streets の通知にフォローは出ないので、フォローはフォロー・フォロワーの一覧で見える形（kind:3）だけを作っている。

### 基準時刻

投稿の時刻は、基準時刻から「どれだけ前か」で書いてある。`--time` で基準時刻を決めると、画面に出る時刻まで毎回同じになる。省くと今。

```sh
pnpm screenshot home --time "2026-09-23T19:00:00+09:00"
```

### 立てたリレーへ入れ直す

```sh
pnpm screenshot:seed notifications --time "2026-09-23T19:00:00+09:00"
```

立っているリレーへ、WebSocket でイベントを送り直す。同じ基準時刻なら同じイベントなので、何度送っても増えない。まっさらにしたいときは `pnpm screenshot` を立て直す。

`pnpm screenshot:generate <シナリオ>` は、イベントを `tools/screenshot/.out/<シナリオ>.jsonl` に書き出すだけで何も立てない。

## 書き足す

### 人を足す

`src/users.ts` に足す。キー（`mio` など）がシナリオから指すときの ID で、鍵もこの ID から決まる（`src/keys.ts`）。実在の人や、知られている Nostr のユーザーに似せない。

```ts
export const users = {
  // …
  yui: {
    name: "yui",
    displayName: "Yui",
    about: "パン屋で働いています。",
    picture: "avatar-yui.svg",
  },
} as const satisfies Record<string, UserProfile>;
```

アイコンの画像は `assets/` に置く。シナリオに無い ID を書くと、型検査（`pnpm typecheck`）で分かる。

### 投稿を足す

みんなのふだんの投稿は `src/common/timeline.ts`、そのシナリオだけのものは `src/scenarios/<名前>.ts` に書く。

```ts
{
  id: "yui-bread",          // 返信・引用・リポスト・リアクションから指すときの名前（省いてよい）
  author: "yui",
  ago: "40m",               // 基準時刻の 40 分前。"45s" "2h" "1d" "1h30m" とも書ける
  content: "朝いちばんのクロワッサンが焼けました。 #bread",
  images: ["photo-bread.jpg"], // assets/ のファイル名。本文の末尾に URL が付く
}
```

- 返信は `replyTo: "<id>"`、引用は `quote: "<id>"`
- 本文で人を指すときは `{@mio}` と書く（`nostr:npub…` に置き換わる）
- `#` のハッシュタグは、そのまま `t` タグになる
- リアクションは `reactions` に `{ author, to, emoji?, ago }`（`emoji` を省くといいね）
- リポストは `reposts` に `{ author, of, ago }`、Zap は `zaps` に `{ from, to, sats, message?, ago }`

返信や引用は、指す投稿より後の時刻にする（前の時刻だと、組み立てるときに止まって教えてくれる）。

### 画像を差し替える

`assets/` の画像は、色と形だけの付け替え用。宣伝に使う写真は、使ってよいことを確かめたうえで、同じ名前で置き換える（`.jpg` などに替えるなら、fixture のファイル名も替える）。

### シナリオを足す

`src/scenarios/<名前>.ts` を作り、`src/scenarios/index.ts` の `scenarios` に足す。

```ts
import { everydayFollows, everydayPosts } from "../common/timeline";
import { defineScenario } from "../scenario";

export default defineScenario({
  description: "パンの話題",
  viewer: "mio",
  follows: everydayFollows,
  posts: [...everydayPosts /* , このシナリオの投稿 */],
  // 見る人のデッキ。省くと Streets の既定（ホームと通知）
  deck: [{ kind: "home" }, { kind: "hashtag", tag: "bread" }],
});
```

`pnpm --filter @streets/screenshot test` が、どのシナリオも組み立てられて、署名がアプリの検証を通ることを確かめる。

## 注意

- 鍵は ID から決まる（`sha256("streets-screenshot/<ID>")`）。ローカルのスクリーンショット専用で、本番には使わない
- リレーは `localhost` だけで待ち受ける
