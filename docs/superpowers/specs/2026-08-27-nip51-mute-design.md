# NIP-51 ミュート — 設計

## 0. このスライスは何のためにあるか

v1 には kind:10000 の公開タグを組み立てる部品があるが、リストの取得、
非公開項目の暗号化、画面への適用、設定画面からの編集が無い。そのため、
投稿・著者・ハッシュタグ・単語をミュートしてもタイムラインから除外できない。

このスライスでは NIP-51 のミュートリストを一つの縦断スライスとして実装する。
対象は次のとおり。

- 公開タグと NIP-44 暗号化 content の読み書き
- 既存の NIP-04 暗号文の読み取り
- NIP-07 / NIP-46 への暗号処理の委譲
- カラムとスレッドへのミュート適用
- イベントメニューと設定ダイアログからの追加・解除

秘密鍵、復号後のリスト、暗号方式の判定を描画コンポーネントへ持ち込まない。

## 1. 所有権と interface

`MuteList` をアカウント単位の深いモジュールとして設ける。画面が使う interface は
対象、表示状態、操作だけを表し、kind:10000、タグ名、暗号方式、Writer、EventStore は
実装内へ隠す。

```ts
type MuteVisibility = "private" | "public";

type MuteEntry = {
  target: MuteTarget;
  visibility: MuteVisibility;
};

type MuteListState =
  | { phase: "signed-out" }
  | { phase: "loading" }
  | { phase: "error" }
  | {
      phase: "missing" | "ready";
      entries: readonly MuteEntry[];
      privatePart: "ready" | "unavailable" | "invalid";
    };

type MuteList = {
  state: Accessor<MuteListState>;
  saving: Accessor<boolean>;
  error: Accessor<string | undefined>;
  refresh(): Promise<void>;
  matches(event: NostrEvent): readonly MuteEntry[];
  add(target: MuteTarget, visibility: MuteVisibility): Promise<void>;
  remove(entry: MuteEntry): Promise<void>;
  move(entry: MuteEntry, to: MuteVisibility): Promise<void>;
};
```

`MuteListProvider` はログイン中の pubkey、Signer、Writer、EventStore を組み合わせ、
デッキと設定ダイアログの両方を包む。`SettingsDialog` へ項目や保存関数を Props で
列挙しない。リレー設定の `AccountSettings` と統合して巨大な設定 interface にもせず、
ミュートの規則は `MuteList` に局所化する。

同じ対象が公開部と非公開部の両方にあれば、設定画面では別の `MuteEntry` として示す。
`matches` は両方をまとめて判定し、同時に一致した項目をすべて返す。

## 2. 取得とメモリ境界

ログイン後、自分の write リレーから最新の kind:10000 を取得する。取得中、取得失敗、
存在しない、取得済みを `MuteListState` で区別し、未取得を空リストとして確定しない。

署名済み kind:10000 は `EventStore` へ入れてよいが、永続キャッシュ対象には登録しない。
復号した非公開タグ配列は `MuteList` のセッションメモリだけに保持し、EventStore、
IndexedDB、localStorage には入れない。ログアウトまたはアカウント切替で Provider ごと
破棄する。

リレーから新しい kind:10000 が届き、EventStore の最新版が変わった場合は再解析する。
保存中の操作は `MuteList` 内で直列化し、連続した追加・解除が同じ旧版から分岐して
互いを上書きしないようにする。

## 3. 公開部と非公開部

### 3.1 認識する対象

| `MuteTarget` | NIP-51 のタグ | 正規化 |
| --- | --- | --- |
| `pubkey` | `p` | 64 文字の小文字 hex |
| `thread` | `e` | 64 文字の小文字 hex |
| `hashtag` | `t` | 先頭の `#` だけを除く |
| `word` | `word` | 小文字化 |

設定画面の著者入力は hex / npub / nprofile、スレッド入力は hex / note / nevent を受ける。
秘密鍵を表す nsec と、対象種別に合わない NIP-19 prefix は受けない。

認識しない公開タグは順序と値を変えずに保つ。認識しない非公開タグ配列も同様に保つ。
配列の先頭 2 要素だけで認識対象を判定し、追加要素を含むタグは、削除・移動しない限り
そのまま残す。

### 3.2 非公開 content

非公開部は JSON のタグ配列を NIP-44 で自分自身の pubkey 宛てに暗号化する。
新しく書く暗号文は NIP-44 だけにする。既存 content に `?iv=` が含まれる場合は
旧 NIP-04 として読み取るが、次に非公開部を変更するときは NIP-44 へ移行する。

復号不能、JSON 不正、タグ配列でない content は `privatePart: "invalid"` とする。
この状態で非公開部を上書きしない。既存 content を一字も変えない公開部だけの操作は
許可する。NIP-44 を使えない署名器では `privatePart: "unavailable"` とし、同じく
公開部だけを編集できる。

イベントメニューからの追加は既定で `private` とする。NIP-44 を使えない場合に
黙って公開へ切り替えず、操作できない理由を表示する。設定画面でユーザーが明示的に
`public` を選んだ場合だけ公開タグへ追加する。

## 4. Signer の能力

`Signer` に、どの署名器にも必須ではない次の能力を持たせる。

```ts
nip44?: {
  encrypt(peerPubkey: string, plaintext: string): Promise<string>;
  decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
};
nip04?: {
  decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
};
```

NIP-04 は旧リストの読み取り専用であり、encrypt は公開しない。NIP-07 は
`window.nostr` の能力を Adapter で写す。NIP-46 は `nip44_encrypt`、
`nip44_decrypt`、`nip04_decrypt` を transport 経由で呼び出す。

新規 bunker 接続の要求権限には `sign_event:10000` と上記 3 能力を加える。
既存セッションで許可が足りなければ再承認が必要だと表示し、公開保存へ縮退しない。
暗号処理の peer pubkey は常にログイン中の自分自身であり、アプリは本人鍵を受け取らない。

## 5. 読み書きの原子性

非公開部の変更は「最新版を取得する → 復号する → 変更する → 暗号化する → 署名する」
という一続きの read-modify-write である。取得を UI 側へ出すと、取得後から保存までに
届いた変更を古い内容で上書きできる。

`Writer.replace` の mutation を同期・非同期の両方に対応させ、最新版を mutation へ
渡した後、その完了を待ってから created_at と署名を付ける。

```ts
type Replacement = (
  current: NostrEvent | undefined,
) => EventDraft | Promise<EventDraft>;
```

既存の同期 `Mutation` はそのまま渡せる。暗号化以外のビルダを Promise 対応へ変えず、
合成規則もこのスライスでは増やさない。`MuteList` が private/public の位置を決め、
kind:10000 全体を一回の replacement で更新する。

公開部の変更では暗号文をそのまま保つ。非公開部の変更では、認識対象以外も含む復号済み
タグ配列全体を再暗号化する。publish が全滅した場合の楽観挿入巻き戻しは既存 Writer の
契約に従う。

## 6. ミュート判定

`MuteList.matches(event)` は次を判定する。

- `p`: `event.pubkey` と一致
- `e`: `event.id`、root 参照、reply 参照のいずれかと一致
- `t`: イベントの `t` タグ値と一致
- `word`: 小文字化した本文に部分一致

`e` は NIP-51 のスレッドミュートとして扱う。イベントメニューから追加するときは、
root 参照があれば root id、無ければ選択したイベント id を保存する。したがって Penpot の
「このノートをミュート」は実際の作用に合わせて「このスレッドをミュート」と表示する。

判定は EventStore への挿入より後に行う。SubscriptionManager や EventStore で捨てると、
解除後に既に受信済みのイベントを表示できず、再購読が必要になるためである。

## 7. 画面への適用

カラム直下のイベントは、DeckColumn が Store 由来の一覧からミュート済みを除外してから
`ColumnItems` へ渡す。仮想リストへ渡した後で DOM だけ隠さない。全件がミュート済みの
場合は「取得中」ではなく空のカラムとして扱う。

スレッド、引用、返信ツリーなどの入れ子は、構造を壊さないため `EventView` の共通入口で
本文の代わりに小さいミュート表示を出す。ここでは次の操作を提供する。

- この表示だけ一時的に開く
- 該当するミュート項目を解除する

一時表示はコンポーネントのローカル状態で、リストを書き換えない。著者・スレッド・単語
など複数理由が一致した場合、解除は選んだ 1 項目だけを対象にし、まだ別の理由が残れば
ミュート表示のままにする。

## 8. 設定ダイアログとイベントメニュー

プリミティブは Ark UI を使う。設定ダイアログの左ナビに「ミュート」を追加し、既存の
Penpot Settings のダイアログ寸法、ナビ、余白、色トークンを維持する。Penpot には
ミュート本文の完成デザインがまだ無いため、本文はリレー設定と同じ行・入力・ボタンの
リズムで組み、視覚仕様が追加されたときに差し替えられる構造にする。

本文は次を持つ。

- 種別: 著者 / スレッド / ハッシュタグ / 単語
- 値の入力
- 公開範囲: 非公開 / 公開。初期値は非公開
- 追加ボタン
- 登録済み項目の種別、表示用の値、公開範囲、削除ボタン
- 非公開部を読めない場合の、再承認または対応署名器を案内する警告

公開範囲の変更は、元の項目を削除して同じ対象を別の部へ追加する一回の replacement とし、
途中状態を publish しない。

イベントメニューは Penpot の Anatomy/actions に従ってイベント操作と著者操作を分け、
「このスレッドをミュート」「この著者をミュート」を追加する。自分自身の著者ミュートは
表示しない。既に同じ対象がミュート済みなら重複追加せず、設定画面またはミュート表示から
解除できることを示す。

## 9. エラー表示

ユーザーが行動できる失敗だけを表示する。

- 署名器が暗号化に非対応: 公開保存へ切り替えず、対応署名器または権限再承認を案内
- 非公開部が復号・解析不能: 非公開部を保護したまま、公開部だけ編集可能だと案内
- 署名拒否: 操作をキャンセルできる形で表示
- publish 全滅: Writer の巻き戻し後、保存されなかったと表示

接続本数、再試行回数、復号例外の生メッセージは通常画面へ出さない。

## 10. テスト

### 10.1 ブラウザ無し

- 公開タグと NIP-44 / 旧 NIP-04 content を同じ `MuteEntry` 形式へ読める
- 未知の公開タグと非公開タグ配列を変更せず保つ
- 不正な暗号文・JSON では非公開部の変更を拒み、公開部変更では content を保つ
- 新規の非公開保存は常に NIP-44 になる
- pubkey / thread / hashtag / word の各判定と正規化が働く
- Writer は非同期 replacement を待ち、失敗時は署名・挿入へ進まない
- MuteList は連続操作を直列化し、前の変更を次の最新版へ含める
- ログアウトとアカウント切替で復号済み項目が破棄される
- NIP-07 / NIP-46 Adapter が暗号処理を対応する外部署名器へ委譲する
- カラムへ渡す前にミュート済みイベントを除外し、EventStore には残す
- 入れ子の EventView は一時表示と 1 項目ずつの解除ができる

新しいテストには「捕まえる変異」を書き、対応する変異を実際に入れて赤くなることを
確認してから戻す。`src/core/nostr/build/**` と `src/core/write/**` の変更は mutation test も
通す。

### 10.2 E2E

ローカルリレーと NIP-07 スタブを使い、次を確認する。

- イベントメニューから著者とスレッドを非公開でミュートできる
- 保存された kind:10000 の公開 tags に対象が無く、content を復号すると対象がある
- ミュート後、該当イベントがカラムから消える
- 設定ダイアログに登録済み項目が現れ、解除すると受信済みイベントが再表示される
- 公開を明示して追加した項目だけが tags に入る
- NIP-44 非対応時に非公開対象を公開 tags へ漏らさない

## 11. 範囲外

- NIP-78 によるデッキ設定の同期
- リレー単位・カラム単位のミュート
- 正規表現、言語判定、期間付きミュート
- NIP-56 report と block の送信
- Penpot ファイル自体の編集
- 旧 v0 の localStorage ミュート設定の移行
