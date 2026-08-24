# スレッド — 設計

## 0. このスライスは何のためにあるか

v1 が返信について取れるのは**親 1 段だけ**である。`NoteFull`（`src/routes/v1/renderers/Note.tsx`）が `replyTarget()` の結果を `<EventView variant="compact">` へ渡し、その 1 件を出して終わる。ある投稿への返信を集める経路は存在しない。

そのため会話が読めない。通知から返信へ辿っても、そこが行き止まりになる。[機能の棚卸し](../../design/v1-feature-inventory.md) が「2.2 スレッド」を通知カラム（2.1）より先に置いているのはこの理由による。

`src/core/read/source.ts` の `Order` には `"thread-tree"` という値だけが予約されており、`section-reader.ts` が「スレッドカラムの計画で足す。それまでは降順で扱う」と書いたまま止まっている。**本スライスはこれを足さずに削る** —— 3 節参照。

前提知識は [CONTEXT.md](../../../CONTEXT.md)、決定は [docs/adr/](../../adr/)、スライスの記録は [read-layer-followups.md](../../design/read-layer-followups.md)。

## 1. 表示の形は木ではなく 1 本の背骨

人間が指定した形（2026-08-22）:

```
祖先（根まで、compact）
  …
親（compact）
選択したイベント（full）
それへの返信 1（compact）
それへの返信 2（compact）
  …
```

**木ではない。**兄弟の枝も、返信の返信も出さない。返信を押せばそれが新しい「選択したイベント」になり、背骨が引き直される。

この形は v0 の挙動でもあり、[2026-08-21 の redesign](../../design/v1-feature-inventory.md) の `Thread / stack` ボードが描いたものでもある。

## 2. 範囲

**含む。**

- 根への 1 購読でスレッド全体を取る経路
- 背骨を計算する純関数（`threadSpine`）
- 根を指す `e` タグを返す `threadRoot()`（`event-refs.ts`）
- カラム内のナビゲーションスタック（コンポーネント状態）
- ノートを押してスレッドを開く導線
- `Order` から `"thread-tree"` を削除

**含まない。**

| 落とすもの | 理由 |
|---|---|
| プロフィールをスタックに積むこと | ユーザー詳細カラム（[#205](https://github.com/eyemono-moe/streets/issues/205)）が別にある。スタックの機構は同じものを使えるが、積む中身は別スライス |
| 返信を書くこと | `buildReply` は既にあるが、返信フォームの面が無い。書き込み UI は redesign を当てるスライスでまとめて |
| 兄弟の枝・返信の返信を同時に見せること | 1 節の形が「背骨だけ」と決めている。木の描画は別の設計 |
| スタックのリロード復元 | 人間の裁定（2026-08-22）。デッキの定義は「どのカラムを並べているか」だけを表す、という現在の意味を変えない。[ADR-0013](../../adr/0013-deck-persisted-to-nip78.md) の署名デバウンス問題も増やさない |
| 木構造の並べ替え（`Order: "thread-tree"`） | 3 節 |

## 3. `Order: "thread-tree"` は答えではなかったので削る

背骨は**並べ替えではなく計算**である。祖先の連鎖を辿り、選択したイベントを挟み、直接の返信を並べる —— これは `SectionReader` が持つ「保持順を決める全順序」では表せない。同じ 1 件が「祖先」にも「返信」にもなり得ないのは事実だが、順序関数は**イベント 2 件を比べる**形しか取れず、「focus からの距離」という文脈依存の値を持てない。

したがって `Order` に値を足すのではなく、予約されていた `"thread-tree"` を削る。`section-reader.ts:223` のコメント（「スレッドカラムの計画で足す」）も一緒に消す。**予約したまま実装されない値は、次に読む人へ「ここに答えがある」と誤って知らせる。**

## 4. 取得 —— 根への 1 購読

```ts
{
  kind: "literal",
  filters: [
    { ids: [rootId] },              // 根そのもの
    { kinds: [1], "#e": [rootId] }, // 祖先も返信も全部ここに入る
  ],
}
```

既存の `ColumnSource` の `literal` で表せるので、**新しいソース種別を作らない**。NIP-01 は 1 つの `REQ` に複数フィルタを載せることを認めており（OR）、購読は 1 本。**スレッドの深さにも幅にも依存しない。**

### 4.1 なぜ根に投げるのか

NIP-10 を守るクライアントの返信は、深さに関わらず**全員が根を `e` タグ（root マーカー）で指す**。したがって根への `#e` 1 本で、選択したイベントの祖先も、選択したイベントへの返信も、同時に届く。

選択したイベントに `#e` を投げる形だと、返信は取れるが**祖先が取れない**。祖先は親 → 祖父 → … と深さぶん逐次的に引くことになり、深いスレッドで待ち時間が深さに比例する。

守らないクライアントの返信は欠ける。これは `status.incomplete`（リレーが応答しない、著者が被覆できない）ではなく、**背骨の連鎖が途中で切れる**という形で現れる（5 節）。

### 4.2 `threadRoot()` を足す

`replyTarget()`（`src/core/nostr/event-refs.ts`）は**直接の親**を返す。`reply` マーカーがあればそれを返し、無いときだけ `root` マーカーへフォールバックするので、返信への返信では根が取れない。

```ts
/** 根を指す `e` タグ。イベント自身が根なら undefined。 */
threadRoot(event: NostrEvent): IdRef | undefined
```

`root` マーカーの付いた `e` タグだけを見る。無ければ `undefined` を返し、**呼び出し側はそのイベント自身を根として扱う**。

[ADR-0004](../../adr/0004-kind-knowledge-lives-in-kind-specific-code.md) の判定基準に照らすと、これは「kind:1 の `e` タグの root マーカーは何を意味するか」を含むので kind 側 —— `event-refs.ts` が正しい置き場所である（`replyTarget` / `quoteTargets` / `repostTarget` の隣）。

## 5. 背骨の計算 —— 純関数

`src/core/view/thread-spine.ts`（`reaction-groups.ts` の隣）。ネットワークも store も触らない。

```ts
export type ThreadSpine = {
  /** 根に近い順。focus は含まない。 */
  ancestors: NostrEvent[];
  focus: NostrEvent | undefined;
  /** created_at 昇順。focus を直接の親とするものだけ。 */
  replies: NostrEvent[];
  /** 祖先の連鎖が根まで到達したか。 */
  reachedRoot: boolean;
};

export const threadSpine = (
  events: readonly NostrEvent[],
  focusId: string,
): ThreadSpine;
```

### 5.1 祖先

`focus` から `replyTarget()` で 1 段ずつ上へ登り、`events` の中から一致する id を探す。見つからなければそこで止める。

**止まったことを黙らせない。**`reachedRoot: false` を返し、UI は連鎖が切れていることを出す（[ADR-0011](../../adr/0011-performance-budget.md)「劣化を隠さない」）。黙って止めると、途中の祖先が欠けたスレッドが「根から始まっている」ように見え、**誰が誰に返信したのかを読み違える**。

`focus` 自身に `replyTarget` が無ければ `ancestors` は空で `reachedRoot: true`（自分が根）。

**循環を踏まない。**壊れた（あるいは悪意ある）イベントは自分自身や祖先を親として指せる。訪問済みの id を集合で持ち、再訪したらそこで打ち切る —— リレーは NIP-10 のタグ意味論を検証しないので、この形のイベントは publish できてしまう。

### 5.2 返信

`events` のうち `replyTarget()?.id === focusId` のものを `created_at` 昇順（同値は `id` 昇順、`compareEvents` と同じ全順序）で並べる。

**根への購読は選択したイベント以外への返信も運んでくる**が、それらはここで落ちる。1 節の形が「直接の返信だけ」と決めているため。

### 5.3 focus 自身が届いていない場合

`focus: undefined` を返す。押した時点でそのイベントは手元にあるので通常は起きないが、`focusId` を外から与える経路（将来のディープリンク）では起きうる。UI は「読み込み中」を出す —— 既存の `EventView` が id で解決できないときと同じ扱い。

## 6. カラム内のスタック

`ColumnDef` は変えない。スタックは `DeckColumn` のコンポーネント状態。

```ts
type Frame = { focusId: string };
// 空 = 根のカラム。push でスレッドへ進み、pop で戻る。
const [stack, setStack] = createSignal<Frame[]>([]);
```

### 6.1 根のカラムの購読は生かしたままにする

スレッドを開いても、根のカラムの `createSection` は破棄しない。戻ったときに取り直しが起きないため。

代償は接続予算（[ADR-0011](../../adr/0011-performance-budget.md) の 30 接続）である。**カラムごとに最大 +1 本**の購読が増える。8 カラム全部でスレッドを開けば +8。予算を超えた場合は `ConnectionPool` が既存の経路で報告するので、黙って壊れることはない。

**スタックが深くなっても購読は増えない。**スレッドの中でさらにノートを押したとき、新しい `focusId` は**同じ根**を持つのが普通なので、購読のフィルタは変わらない。

ただし**張り直しが起きないことは自動では成立しない。**`createSection` は `createEffect` の中で `options.source()` を読んで `SectionReader` を作り直す（`src/core/solid/create-section.ts`）ので、内容が同じでも**毎回新しいオブジェクトを返すアクセサ**を渡すと、`focusId` が変わるたびにセクションごと作り直される —— 購読が張り直され、`items` が空から積み直しになる。

したがってスレッドのソースは**根の id をキーにしてメモ化する**（`createMemo` の `equals` で根の id を比較するか、根の id を `createMemo` にしてからソースを組む）。これは実装上の要求であり、守らなければ「戻る」だけでなく「スレッド内で 1 段進む」たびに取り直しが起きる。別の根へ移る場合（引用先を押すなど）だけソースが変わってほしい。

### 6.2 ヘッダー

スレッド表示中は、カラムヘッダーのタイトルが「スレッド」になり、左端に戻るボタンが出る。

深さをドットで示す案（redesign の `Thread / stack` ボード由来）は、ユーザー判断で不要と裁定され意図的に見送った（[followups](../../design/read-layer-followups.md) の「スレッド」節参照）。

## 7. 入口 —— すべてのノートが自分自身のスレッドを開く

`<article data-testid="note">` を押すと、**その `<article>` が描いているイベントの**スレッドが開く。`NoteFull` と `NoteCompact` の両方で、`variant` による区別はしない。

**入れ子は内側が勝つ。**引用カードや返信先の中のノートを押せば、内側の `<article>` がその click を拾って `stopPropagation()` する。外側のノートには届かない。したがって「引用先のスレッドを開く」も「返信先のスレッドを開く」も、外側と同じ 1 つの規則で成立し、深さに関係なく効く。

**発火させない場所:**

| 場所 | 理由 |
|---|---|
| 本文中のリンク・ハッシュタグ・`nostr:` 参照 | それぞれ自分の目的地を持つ |
| 名前・アイコン | ホバーカードのトリガー。将来ユーザーカラムを開く（[#205](https://github.com/eyemono-moe/streets/issues/205)） |
| アクション列・リアクションのチップ・⋮ メニュー | 自分の動作を持つ |
| ドラッグでテキストを選択した後 | `mousedown` と `mouseup` の座標が動いていたら発火しない |

[ADR-0026](../../adr/0026-actionable-errors-visible-diagnostics-behind-developer-mode.md)「押しても何も起きないものを押せる見た目にしない」に対しては、本スライスで実際に動くようになるので抵触しない。

### 7.1 カラム 1 本を範囲とする context

スタックは**カラムごと**の状態だが（6 節）、`RenderContext`（`src/core/view/render-context.tsx`）はデッキ全体で 1 つである。したがって `RenderContext` には足さず、`DeckColumn` が提供する別の小さな context を作る。

```ts
/** このノートを起点にスレッドを開く。カラムの外では undefined。 */
useThreadNav(): ((focusId: string) => void) | undefined
```

**`useRender()` と違って、provider が無くても例外を投げない。**`useRender` が投げるのは「provider を渡し忘れた」が常に配線ミスだからだが、こちらは違う —— `/debug/v1-section` のようにナビゲーションを持たない面でイベントを描くのは正当な使い方であり、そこではノートが押せないだけでよい。**投げると、デバッグルートがスレッドと無関係に落ちる。**

`undefined` のとき `<article>` は click ハンドラも押せる見た目も持たない（ADR-0026）。

## 8. テスト

### 8.1 `threadSpine`（純関数、モック不要）

| 主張 | 捕まえる変異 |
|---|---|
| root+reply マーカーの返信で、祖先が根まで並ぶ | `replyTarget` ではなく `threadRoot` で登る（親を飛ばして根へ跳ぶ） |
| 祖先は根に近い順 | 逆順で返す |
| `replies` は focus を直接の親とするものだけ | 根を指す全イベントを入れる（孫まで混ざる） |
| `replies` は created_at 昇順 | 降順にする |
| 途中の祖先が欠けていれば `reachedRoot: false` | 常に `true` を返す |
| focus 自身が根なら `ancestors` は空で `reachedRoot: true` | 空を「切れている」と誤判定する |
| 自分自身を親に指すイベントで無限ループしない | 訪問済み集合を持たない |
| focus が `events` に無ければ `focus: undefined` | 例外を投げる |

`threadRoot()` も別に固定する: `root` マーカーだけを見ること、`reply` マーカーに引きずられないこと、マーカー無しの `e` タグを根と誤認しないこと。

**ミューテーションテストの対象外。**[ADR-0029](../../adr/0029-mutation-testing-for-build-and-write.md) が定める範囲は `src/core/nostr/build/` と `src/core/write/` である。`thread-spine.ts` は純関数でテストが速く、同じ扱いに値するが、**範囲を広げる判断は本スライスではしない** —— ADR-0029 を書いた直後であり、まず現在の範囲での運用感を見る。followups に記録する。

### 8.2 e2e

1 本。ノートを押す → 祖先と返信が出る → 戻る → 元のカラムの位置に戻っている。

シードには**根 → 中間 → 選択するイベント → 返信 2 件**を置き、祖先が 2 段あることを実際に測る（1 段だと `replyTarget` と `threadRoot` の取り違えが通ってしまう）。

**入れ子から開く経路も同じ e2e で測る。**スレッドの中の祖先（`compact`）を押すと、その祖先を選択したイベントとする背骨に引き直される。これが通らないと 7 節の `stopPropagation` が効いていないか、`compact` にハンドラが付いていないかのどちらかである。

## 9. 決めなかったこと

- **スレッド内で `#e` 購読が拾った「他の枝」の扱い。** いまは捨てる。将来「返信 3 件」のような件数表示をするなら材料になるが、本スライスでは表示しない
- **深いスレッドでの上限。** `MAX_ITEMS_PER_SECTION`（200）がそのまま効く。背骨が 200 段を超えることは現実にはないが、根への購読が 200 件で頭打ちになると**背骨の途中が欠ける**形で現れる。実地で起きたら followups へ
- **ミューテーションテストの範囲拡大**（8.1 節）
