import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { MAX_CONNECTIONS } from "./default-relays";

export type PooledSubscription = { close(): void };

/**
 * `hold()` が返すハンドル。`PooledSubscription` と違い `subscription` を
 * 一切持たない — hold は REQ を出さない (`hold()` のコメント参照)。
 */
export type PooledHold = { release(): void };

/**
 * `subscribe()` と `hold()` へ渡す省略可能なオプション。
 *
 * `reserved: true` は ADR-0011 の予算チェック (`size >= maxConnections`) を
 * 丸ごと迂回する唯一の脱出口 — **ブートストラップ (`warmUpRouting`,
 * `src/core/read/bootstrap.ts`) 専用であり、それ以外では絶対に使わないこと。**
 * ウォームアップは Outbox ルーティング表そのものを作る処理なので、Outbox の
 * 選択が埋めた予算に阻まれて自分が走れないと、ルーティングが永遠に成立しない
 * (循環する)。これがこの迂回路が存在する唯一の理由であり、ここを起点に別の
 * 呼び出し元が「予算が埋まっていても構わず開きたい」という理由で真似し始めた
 * 瞬間、ADR-0011 の 30 接続という上限は数字の意味を失う。新しい呼び出し元を
 * 追加する前に、まず ADR-0011 を読み直すこと。
 */
export type SubscribeOptions = { reserved?: boolean };

/**
 * 再接続のタイマーを注入するための最小の口 (ADR-0021)。読み取り層は DOM も
 * Node のグローバルも直接掴まない、という構造上の主張をテストで示すために
 * `setTimeout`/`clearTimeout` を外から渡せるようにする。既定値
 * (`defaultScheduler`) はグローバルの `setTimeout`/`clearTimeout` を
 * そのまま使う — 本番ではそれで正しい。ハンドルの型を `typeof setTimeout`
 * の戻り値に合わせているのは、DOM lib と Node lib のどちらがアンビエントに
 * 効いていても (`number` でも `NodeJS.Timeout` でも) そのまま通るように
 * するため。
 */
export type Scheduler = {
  setTimeout: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
};

/**
 * `SubscriptionManager` はこの既定値をそのまま `ConnectionPool` へ渡している
 * (`subscription-manager.ts:260`) — マネージャ自身はもう独自のタイマーを
 * 持たない。かつては `SubscriptionManager` 自身の再プランのデバウンスタイマー
 * もこれを共有していたが、そのタイマーは後続 #4 (ローカルフィルタ照合、
 * docs/superpowers/specs/2026-08-02-local-filter-matching-design.md 6 節) で
 * 削除された。今この export が生きている理由は「読み取り層のどこであれ
 * "注入されなければ実タイマー" という規約を一箇所にしておく」ことと、
 * `ConnectionPool` の再接続タイマー (ADR-0021) がこれを使うことの 2 つのみ。
 */
export const defaultScheduler: Scheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

/** 指数バックオフの初回間隔 (ADR-0021)。 */
const RECONNECT_BASE_MS = 1_000;
/** 指数バックオフの上限。ここで頭打ちにして、諦めずに回し続ける (ADR-0021)。 */
const RECONNECT_MAX_MS = 60_000;

/**
 * この回数だけ連続で「開けなかった」URL を degraded とみなし、
 * リレー選択の候補から外す (ADR-0025 の入力)。正しい指数バックオフの
 * 下では 4 回はおよそ 1+2+4+8 = 15 秒ぶんの試行にあたる。
 */
export const DEGRADED_AFTER_FAILURES = 4;

/**
 * 最後の失敗からこれだけ何も起きなければ失敗履歴を捨て、候補に戻す。
 * degraded な URL は誰も購読しなくなり再接続も止まる (ADR-0021 の
 * 「諦めない」は購読者が居る間の話) ので、この経路が無いと永久に
 * 候補から外れたままになる。サーキットブレーカの half-open にあたる。
 */
export const DEGRADED_COOLDOWN_MS = 300_000;

/**
 * `#scheduleReconnect`/`#noteFailure` を呼ぶ理由 (Task 2 fix round 1,
 * Important 1)。`#failures.count` (バックオフの指数) はどちらの理由でも
 * 増える一方、`#failures.hard` (degraded 判定) は `"relay"` のときだけ
 * 増える。
 *
 * 予算超過 (`"budget"`) はリレー自身の健全性と無関係 (ADR-0011 の制約で
 * あって ADR-0021 の健康シグナルではない)。健全なリレー A のソケットが
 * 死んで再接続を待っているだけでも、たまたま B が枠を握っていれば
 * `#reconnect` は予算超過で何度もバウンスする — それを `"relay"` と
 * 同じに数えると、一度も `connect()` に失敗していない A が degraded 判定
 * され、Task 4 に選択から外され、除外中は誰も購読しないので二度と
 * バックオフが縮まず、最大 300 秒 (`DEGRADED_COOLDOWN_MS`) 沈黙する。
 */
type ReconnectReason = "relay" | "budget";

/**
 * `publish()` 全体のタイムアウト (final review, Critical 1)。
 *
 * NIP-01 は「リレーは OK を送らねばならない (MUST)」と定めるが、実際には
 * レート制限時に EVENT フレームを黙って捨てるリレーが存在する。
 * `WebSocketRelayConnection.publish()` は OK が届くか、ソケットが死ぬ
 * (reject) までしか待たない — このプールの `release()` はその Promise の
 * `.then(onFulfilled, onRejected)` からしか呼ばれないので、OK も死亡通知
 * も来ないリレーが 1 本あるだけで `pooled.entries` が永遠に空にならず、
 * 誰も購読していないそのリレーが 30 接続予算のうち 1 本を握ったまま
 * 戻らない。`v1-preview.tsx` は `publisher.publish()` を `await` するので、
 * このハングは投稿フォームの `finally { setPosting(false) }` まで巻き込み、
 * 「リロードするまで二度と投稿できない」という壊れ方をする。
 *
 * 値は `bootstrap.ts` の `DEFAULT_TIMEOUT_MS` / `subscription-manager.ts` の
 * `DEFAULT_FETCH_ONCE_TIMEOUT_MS` と同じ 10 秒 — この読み取り層は「リレー
 * 1 本との往復にどれだけ待つか」をどこも 10 秒に揃えている。publish 側
 * だけ別の値にする理由は無い。
 */
const PUBLISH_TIMEOUT_MS = 10_000;

/**
 * `publish()` が予算の参照カウント (`pooled.entries`) に相乗りするためだけ
 * に足す一時的な `Entry` のハンドラ。REQ を送らないので `onEvent`/`onEose`
 * が呼ばれることは無い — `#reconnect()` が全エントリを引き直す際に
 * (この一時エントリがまだ残っていた場合) `connection.subscribe([], ...)`
 * が失敗しても黙って吸収するためだけに存在する。
 */
const PUBLISH_ONLY_HANDLERS: RelaySubscriptionHandlers = {
  onEvent: () => {},
  onEose: () => {},
  onClosed: () => {},
};

export type ConnectionPoolOptions = {
  connect: (url: RelayUrl) => RelayConnection;
  /** アプリ全体で同時に開く接続の上限 (ADR-0011)。既定は MAX_CONNECTIONS */
  maxConnections?: number;
  /** 再接続タイマーの注入口 (テスト用)。既定は実タイマー。 */
  scheduler?: Scheduler;
  /** ジッタの注入口 (テスト用)。既定は Math.random。 */
  random?: () => number;
};

/** 1 本の `subscribe()` 呼び出しに対応する登録。 */
type Entry = {
  filters: RelayFilter[];
  handlers: RelaySubscriptionHandlers;
  subscription: RelaySubscription | null;
};

/**
 * 1 つの URL に対するプールの状態。`connection` が `null` なのは
 * 接続を試みて失敗した場合、またはソケットが自然死した場合 —
 * どちらもエントリはこの URL を諦めていないので `#pool` からは
 * 消さない (Task 9 の再接続対象として残す、まさにこのレジストリが
 * 再接続で元のフィルタを張り直す元ネタになる)。
 */
type Pooled = {
  connection: RelayConnection | null;
  entries: Set<Entry>;
  /** 接続の死亡通知の購読解除。`connection` が非 null の間だけ非 null。 */
  offClose: (() => void) | null;
  /**
   * ソケットが**実際に開いた**ことの通知の購読解除。`connection` が非 null
   * の間だけ非 null (`offClose` と同じ規約)。プールの `#failures` を消す
   * (= バックオフをリセットする) のはこの通知が発火した時だけ —
   * `connect()` が例外を投げずに返ったという事実だけでは「繋がった」とは
   * 言えない (2026-08-05 の実地観測)。
   */
  offOpen: (() => void) | null;
  /**
   * 保留中の再接続タイマー。`connection` が非 null の間、あるいは待っている
   * エントリが無くなった間は必ず `null` — タイマーが残ったままだと、
   * 誰も待っていない (あるいは既に繋がっている) リレーへ永遠に再接続を
   * 試み続けることになる。
   */
  timer: ReturnType<Scheduler["setTimeout"]> | null;
  /**
   * この URL が `{ reserved: true }` 経由 (ブートストラップの予算迂回、
   * `SubscribeOptions` 参照) で少なくとも 1 回要求されたか (final review,
   * finding 9a)。`selectRelays` の `pinned` とは別物 — こちらは
   * `ConnectionPool` の予算チェックそのものを迂回する側であり、
   * `reservedSize` はその迂回が「今」何本の生きている接続を占めているかを
   * 露出するためだけに存在する。
   */
  reserved: boolean;
  /**
   * `hold()` が保持している数 (Task 3, 2026-08-05)。`entries` (= `subscribe()`/
   * `publish()` の登録) とは独立したカウンタ — `entries` が 0 になっても
   * `holds` が残っていれば接続は落とさない。ブートストラップがフェーズ①と
   * ②の間でインデクサの接続を落とさずにおくために使う、REQ を出さない唯一の
   * 経路がこれ (`bootstrap.ts` 参照)。`entries.size === 0` を条件にしていた
   * 既存の 5 箇所は全てこのフィールドも見るように直してある —
   * `grep -n "entries.size === 0"` で洗い出したもの。
   */
  holds: number;
};

/**
 * すべてのリレー接続を所有し、予算 (ADR-0011) を実際に強制する唯一の場所。
 * URL ごとの購読レジストリでもある — 生きている登録が Task 9 の再接続で
 * 元のフィルタを張り直す元ネタになる。
 *
 * `subscribe()` を通らない経路で接続を開いてはならない。ルーティング済み・
 * 明示指定・fallback のどの経路であっても、ここを通ることで初めて予算が
 * 効く (旧 SubscriptionManager の #acquire は無条件に connect() していた)。
 */
export class ConnectionPool {
  readonly #options: ConnectionPoolOptions;
  readonly #pool = new Map<RelayUrl, Pooled>();
  readonly #maxConnections: number;
  readonly #scheduler: Scheduler;
  readonly #random: () => number;
  /**
   * `size` の過去最大値 (ADR-0011 の高水位マーク)。
   *
   * `size` は「今」生きている接続だけを数えるので、budget を守れていない
   * 実装でも、超過した接続が死んで枠を返した*後*に読めば予算内に見えて
   * しまう — 特にローカルの到達不能リレーは ECONNREFUSED がミリ秒単位で
   * 返るため、settled になった時点ではもう手遅れ (Task 12 fix round 1)。
   * ソケットを実際に作った瞬間に size を測って最大値を更新することで、
   * 一度でも予算を超えて開いた事実を後から消せないようにする。単調増加
   * のみで、接続が死んでも下がらない。
   */
  #peakSize = 0;

  /**
   * URL → 失敗の記録とその冷却タイマー。**`Pooled` ではなくプールが持つ**
   * — `#drop` でエントリが消えても失われてはならない。消えると
   * 「degraded で除外 → 購読者ゼロ → 履歴消滅 → 再選択 → また除外」という
   * 振動になる (Task 4 が `degradedRelays` を選択に使う)。
   *
   * `count` と `hard` の 2 本を分けて持つ (Task 2 fix round 1, Important 1)。
   * - `count`: `#scheduleReconnect` が呼ばれた回数 (理由を問わない)。
   *   バックオフの指数はこちらから決める — 予算超過で待たされている URL も
   *   ちゃんと間隔を伸ばさないと、そこだけ base 間隔でスピンする。
   * - `hard`: そのうちリレー自身に起因する回数だけ (`ReconnectReason` が
   *   `"relay"` のもの)。`degradedRelays` はこちらだけを見る — 予算超過の
   *   バウンスを健康シグナルとして数えると、一度も `connect()` に失敗して
   *   いない健全なリレーが degraded 判定されてしまう。
   */
  readonly #failures = new Map<
    RelayUrl,
    { count: number; hard: number; timer: ReturnType<Scheduler["setTimeout"]> }
  >();

  /**
   * `onDegradedChanged()` の購読者 (final review, 2026-08-06, Important 1)。
   * `degradedRelays` は Task 4 が実装された時点では公開されているだけで、
   * 読みに行く者が誰も居なかった —— `replan()` を呼ぶのはアプリの外側の
   * 経路 (`subscribe()`/`handle.close()`) だけで、接続が死んで degraded に
   * 積み上がっても誰も再選択を起こさない、という配線漏れが最終レビューで
   * 見つかった。ここはその配線の起点であり、`SubscriptionManager` が
   * 唯一の購読者になる。
   */
  readonly #degradedListeners = new Set<(url: RelayUrl) => void>();

  constructor(options: ConnectionPoolOptions) {
    this.#options = options;
    this.#maxConnections = options.maxConnections ?? MAX_CONNECTIONS;
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#random = options.random ?? Math.random;
  }

  /** 生きている接続の本数だけを数える (ADR-0021: 死んだ接続は予算を占有しない)。 */
  get size(): number {
    let open = 0;
    for (const pooled of this.#pool.values()) {
      if (pooled.connection) open += 1;
    }
    return open;
  }

  /** `size` の観測史上の最大値。予算を測るのはこちら (Task 12 fix round 1)。 */
  get peakSize(): number {
    return this.#peakSize;
  }

  /**
   * `{ reserved: true }` (ブートストラップの予算迂回) 経由で少なくとも
   * 1 回要求された URL のうち、今生きている接続の本数 (final review,
   * finding 9a)。ADR-0025 の `pinned` (選択器の中で予算を優先確保する仕組み)
   * とこの `reserved` (選択器を経由せず予算チェック自体を飛ばす仕組み) は
   * 別物であり、「30 接続」という 1 つの数字について両者が別々に主張して
   * いる — このアクセサはその食い違いを外から観測できるようにするための
   * ものであり、予算そのものを再構成するものではない
   * (docs/design/read-layer-followups.md 参照)。
   */
  get reservedSize(): number {
    let count = 0;
    for (const pooled of this.#pool.values()) {
      if (pooled.connection && pooled.reserved) count += 1;
    }
    return count;
  }

  /**
   * リレー自身に起因する連続失敗 (`hard`) が `DEGRADED_AFTER_FAILURES`
   * 以上に達した URL。`selectRelays` の `degraded` 入力になる (ADR-0025)。
   * 予算超過によるバウンス (`count` には入るが `hard` には入らない、
   * Task 2 fix round 1, Important 1) はここには影響しない。
   */
  get degradedRelays(): readonly RelayUrl[] {
    const urls: RelayUrl[] = [];
    for (const [url, { hard }] of this.#failures) {
      if (hard >= DEGRADED_AFTER_FAILURES) urls.push(url);
    }
    return urls;
  }

  /**
   * `onDegradedChanged()` に今登録されている listener の数 (final review,
   * 2026-08-06)。`reservedSize`/`peakSize` と同じ位置づけの診断値 ——
   * `SubscriptionManager.dispose()` が購読を解除し忘れていないかを、
   * プライベートな `#degradedListeners` を晒さずに外から確認する手段。
   */
  get degradedListenerCount(): number {
    return this.#degradedListeners.size;
  }

  /**
   * URL が `degradedRelays` の membership を変える**瞬間**にだけ通知する
   * (final review, 2026-08-06, Important 1; 復帰側は connection-layer
   * followups の「小さいもの」に積み残されていたのをこのタスクで閉じた)。
   * 入る側は `#noteFailure` が `hard` をちょうど `DEGRADED_AFTER_FAILURES`
   * に到達させた回だけ、出る側は `#clearFailures` が degraded だった URL の
   * 履歴を消す回だけ発火する —— それぞれ同じ方向へは再発火しない。
   * **`DEGRADED_COOLDOWN_MS` ごとに高々 1 往復、という頻度の上限を主張して
   * いるのではない** (final review, 2026-08-06, Minor 3) —— 出口
   * (`onOpen`・`retryNow()`) はクールダウンを待たずに失敗履歴を即座に消すため、
   * 実際の往復の下限は「4 回連続のリレー起因の失敗」にかかる時間 (指数
   * バックオフの下でおよそ 15 秒) であり 300 秒ではない。ここが保証している
   * のはブリップ (単発の失敗) では発火し得ないことだけ —— 詳細は ADR-0021
   * 参照。
   *
   * ADR-0021 の「死亡・復帰は再選択の契機にしない」を破るものではない ——
   * 入る側はブリップでは起こり得ない閾値越え、出る側もその閾値越えの状態を
   * 解く単発の遷移であり、どちらも死亡・復帰そのもの (ソケット 1 本の生死)
   * とは別の問い。ブリップ 1 回で誤発火しないことは
   * `degradedRelays`/`DEGRADED_AFTER_FAILURES` 自体の設計がそもそも保証
   * している (Task 2)。
   *
   * `RelayConnection.onOpen`/`onClose` と同じ形: 購読して解除関数を返す。
   * 名前は「何を報告するか」であって「呼び出し側がそれをどう使うか」ではない
   * —— これは degraded 集合への出入りそのものの通知であり、「replan せよ」
   * という命令ではない (呼び出し側が何をすべきかを決めるのは呼び出し側の
   * 責務)。
   */
  onDegradedChanged(listener: (url: RelayUrl) => void): () => void {
    this.#degradedListeners.add(listener);
    return () => {
      this.#degradedListeners.delete(listener);
    };
  }

  /**
   * `degradedRelays` の membership が変わった URL を購読者へ知らせる。
   * **入る側 (`#noteFailure`) と出る側 (`#clearFailures`) の両方から呼ぶ** ——
   * 出る側が無かったために、クールダウンが明けて候補に戻せるようになった
   * リレーが、無関係な `replan()` が起きるまで候補外のまま残っていた
   * (接続層スライスの積み残し、`docs/design/read-layer-followups.md`)。
   *
   * 集合をコピーしてから回すのは、listener が購読解除を呼んだ場合に
   * 反復中の Set を変更しないため (`onDegradedChanged` の解除関数は
   * `#degradedListeners.delete` を呼ぶ)。
   *
   * listener ごとに try/catch で隔離する (final review, 2026-08-06,
   * Important 1)。`#notifyDegradedChanged` は `#noteFailure`/`#clearFailures`
   * 経由で `subscribe()`/`hold()`/`retryNow()` から同期的に呼ばれうる ——
   * `subscribe()` は「接続や購読の確立に失敗しても例外は外に投げない」と
   * 明記しており、ここが素の呼び出しのままだと 1 つの listener が投げた
   * だけで `subscribe()` 自身が例外を投げて呼び出し元まで抜けてしまう。
   * さらに、隔離しないと 1 つ目の listener が投げた時点で反復が止まり、
   * それより後に登録された listener はこの遷移を一切知らないまま degraded
   * 集合の認識が古くなる。`SubscriptionManager.#deliver` /
   * `SectionReader.#notify` / `#attachConnection` の catch 節 (Task 3) と
   * 同じ作法: 専用の報告チャネルは無いので `console.error` に落とす。主目的は
   * 隔離であって報告ではない。
   */
  #notifyDegradedChanged(url: RelayUrl): void {
    for (const listener of [...this.#degradedListeners]) {
      try {
        listener(url);
      } catch (error) {
        console.error(
          "ConnectionPool: an onDegradedChanged listener threw; isolating it so the remaining listeners keep receiving notifications.",
          error,
        );
      }
    }
  }

  /** ソケットを実際に作った直後に呼ぶ。size の一時的なピークを取り逃さない。 */
  #recordPeak(): void {
    const current = this.size;
    if (current > this.#peakSize) this.#peakSize = current;
  }

  /**
   * `url` の失敗を 1 記録し、冷却タイマーを張り直す (呼ばれるのは
   * `#scheduleReconnect` のみ — 実際に再接続を待つ羽目になった失敗だけを
   * 数える。`#ensureConnection`/`#reconnect` の catch 節は直後に必ず
   * `#scheduleReconnect` を呼ぶので、そちらでも数えると同じ 1 回の失敗を
   * 二重に計上してしまう)。
   *
   * `count` は理由を問わず増える (バックオフの指数用)。`hard` は
   * `reason === "relay"` のときだけ増える (`degradedRelays` 用、Task 2 fix
   * round 1, Important 1) — 予算超過のバウンスは健康シグナルではない。
   *
   * クールダウンを失敗のたびに張り直すのは、失敗し続けている最中に前回の
   * 期限が来て degraded が解除されてしまわないようにするため。
   *
   * `hard` がちょうど `DEGRADED_AFTER_FAILURES` に到達した回だけ
   * `onDegradedChanged()` の購読者へ通知する (final review, Important 1)。
   * `degradedRelays` が消える経路 (open, `retryNow()`, クールダウン) は
   * すべて `#failures` からこの URL のレコードそのものを削除するので、
   * 次に degraded になるときは必ず `previousHard` が 0 から数え直しになる
   * —— この削除規約が保証しているのは「クールダウンごとに高々 1 回」という
   * 頻度の上限ではなく「ブリップでは決して発火しない」ことである (final
   * review, 2026-08-06, Minor 3)。open/`retryNow()` は `DEGRADED_COOLDOWN_MS`
   * を待たずに履歴を消すため、再び入るまでの実際の下限は 4 回連続のリレー
   * 起因失敗にかかる時間 (指数バックオフの下でおよそ 15 秒) —— 詳細は
   * ADR-0021 参照。
   */
  #noteFailure(url: RelayUrl, reason: ReconnectReason): void {
    const existing = this.#failures.get(url);
    if (existing) this.#scheduler.clearTimeout(existing.timer);
    const count = (existing?.count ?? 0) + 1;
    const previousHard = existing?.hard ?? 0;
    const hard = previousHard + (reason === "relay" ? 1 : 0);
    const timer = this.#scheduler.setTimeout(() => {
      // `#failures.delete` を直に呼ばない —— クールダウン満了は degraded
      // 集合からの離脱そのものであり、通知経路を通らない削除を作ると、
      // まさにこのタスクが塞いでいる隙間が別の場所に再発する。
      // 発火済みのタイマーに対して `#clearFailures` が `clearTimeout` を
      // 呼び直すが、これは無害 (実タイマーでは no-op、偽クロックでは
      // 既に消えた id の delete)。
      this.#clearFailures(url);
    }, DEGRADED_COOLDOWN_MS);
    this.#failures.set(url, { count, hard, timer });

    if (
      previousHard < DEGRADED_AFTER_FAILURES &&
      hard >= DEGRADED_AFTER_FAILURES
    ) {
      this.#notifyDegradedChanged(url);
    }
  }

  /**
   * `url` の失敗履歴を消す。呼ばれるのは実際に開いた時 (`#attachConnection`
   * が登録する `onOpen`)、人間が起こした `retryNow()`、そしてクールダウンの
   * 満了 (`#noteFailure` が張るタイマー) の 3 箇所。
   *
   * 消す前に degraded だったなら、その URL は今この瞬間に degraded 集合から
   * 出たことになるので購読者へ通知する —— `selectRelays` の `degraded` 入力
   * から消えただけでは何も起きない (ADR-0021)。**通知しないと、復帰した
   * リレーは次に無関係な `replan()` が走るまで候補に戻らない。**
   */
  #clearFailures(url: RelayUrl): void {
    const existing = this.#failures.get(url);
    if (!existing) return;
    this.#scheduler.clearTimeout(existing.timer);
    this.#failures.delete(url);
    if (existing.hard >= DEGRADED_AFTER_FAILURES) {
      this.#notifyDegradedChanged(url);
    }
  }

  /**
   * `subscribe()` と `publish()` の両方が使う、接続確保の共通部分。
   * 予算チェックとソケットの実際の生成はここに一本化する — 2 箇所に別々に
   * 書くと、どちらかだけ直されて片方が古い (= 予算を迂回する) ままになる
   * 危険がある。それは `{ reserved: true }` が既に空けている穴 (bootstrap
   * 専用の予算迂回) と同じ種類の穴をもう1つ増やすことに等しい。
   *
   * 予算に空きが無ければ `undefined` を返す — これは「新しい URL を開こうと
   * したが枠が無かった」場合だけに限られる。既に開いている (または開こうと
   * 試みて失敗し記録だけ残っている) URL への追加の要求は、新しいソケットを
   * 要求しないので予算に関係なく常に受け付ける。
   *
   * `options.reserved` が `true` のときは、新しいソケットが要る場合でも
   * この予算チェックそのものを飛ばす。`SubscribeOptions` の定義を参照 —
   * ブートストラップ以外での使用は禁止 (`publish()` はこの引数を渡さない)。
   *
   * `connect()` が失敗しても例外は外に投げない — 呼び出し元 (`subscribe()`
   * は `handlers.onClosed(...)`、`publish()` は reject) がそれぞれの形で
   * 失敗を伝える。
   */
  #ensureConnection(
    url: RelayUrl,
    options?: SubscribeOptions,
  ): Pooled | undefined {
    let pooled = this.#pool.get(url);
    // `pooled` が無い場合だけでなく、エントリは残っているが接続が
    // 自然死している場合も新しいソケットが要る = 予算を消費する。
    if (!pooled || !pooled.connection) {
      if (!options?.reserved && this.size >= this.#maxConnections) {
        return undefined;
      }

      if (!pooled) {
        pooled = {
          connection: null,
          entries: new Set(),
          offClose: null,
          offOpen: null,
          timer: null,
          reserved: false,
          holds: 0,
        };
        this.#pool.set(url, pooled);
      }

      try {
        const connection = this.#options.connect(url);
        // `subscribe()`/`#reconnect()` のどちらが呼んでも「接続が繋がった
        // 直後」の後始末を同じにする (final review, Critical 2) — 詳細は
        // `#attachConnection` 参照。
        this.#attachConnection(url, pooled, connection);
      } catch {
        // connection は null のまま。#pool からは消さない (Task 9 が
        // 後で再接続を試みる対象として残す) — ただし publish 専用で
        // 誰も待っていない場合は呼び出し元 (`publish()`) がこの後
        // 空のレコードを片付ける (ledger deferred minor 2)。
        //
        // ここで `#noteFailure` は呼ばない。`subscribe()` はこの直後に
        // 必ず `#scheduleReconnect` を呼ぶので、そちらで数えないと同じ
        // 1 回の失敗を二重に計上してしまう (task-2-report.md 参照:
        // ブリーフ原案はここでも呼ぶ指示だったが、それだと
        // "retries an initial connect() failure" と "doubles the backoff"
        // の遅延系列が食い違って壊れる)。`publish()` 単独で新規 URL の
        // `connect()` が失敗した場合 (誰も待っていない) はこの経路を
        // 通らず `#scheduleReconnect` も呼ばれないため、その失敗は
        // degraded の対象に数えない — publish は購読関係を残さない
        // 一回限りの操作であり、選択器が避けるべき「居座る」relay とは
        // 性質が違う。
      }
    }

    // 一度でも `{ reserved: true }` で要求されたら、この `Pooled` が生きて
    // いる間は reserved として数える (final review, finding 9a) — 同じ URL
    // への以後の通常経路の呼び出しが `reservedSize` から静かに外れてしまわ
    // ないようにするため。
    //
    // **「このプロセス内ではずっと」ではない** (final review, 2026-08-06,
    // Minor 3: 過去のコメントの誤り)。`reserved` は `Pooled` のフィールド
    // であり `Pooled` そのものより長くは生きない。`#drop` はレコードごと
    // 消す (`this.#pool.delete(url)`) ので、ブートストラップが hold を
    // release してこの URL の最後のエントリ/hold が無くなれば `Pooled` ごと
    // 消える。その後に同じ URL へ通常経路 (`{ reserved: true }` を渡さない)
    // で `subscribe()` すると、真新しい `Pooled` が `reserved: false` で
    // 作られる — 同じプロセス・同じ URL でも、間に drop を挟めば
    // `reservedSize` の対象から普通に外れる。挙動を変えるものではなく、
    // このコメントの記述だけを実態に合わせた。
    if (options?.reserved) pooled.reserved = true;

    return pooled;
  }

  /**
   * 購読 (REQ) の経路。接続や購読の確立に失敗しても例外は外に投げない —
   * `handlers.onClosed(...)` に変換して同期的に伝える。これにより、30 本の
   * うち 1 本が死んでいるだけで呼び出し元 (SectionReader) が例外で壊れる
   * ことがなくなる。
   */
  subscribe(
    url: RelayUrl,
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
    options?: SubscribeOptions,
  ): PooledSubscription | undefined {
    const pooled = this.#ensureConnection(url, options);
    if (!pooled) return undefined;

    const entry: Entry = { filters, handlers, subscription: null };
    pooled.entries.add(entry);

    if (pooled.connection) {
      try {
        entry.subscription = pooled.connection.subscribe(filters, handlers);
      } catch {
        entry.subscription = null;
      }
    } else {
      // The connect() attempt above (fresh or retried) still failed. Without
      // this, a relay whose *first* connect() ever fails would never be
      // scheduled for retry at all -- only deaths after a successful connect
      // go through #onConnectionDied. ADR-0021 says "never give up"; this
      // entry is retained (just added above) so #scheduleReconnect's
      // "nobody is waiting" guard does not bail.
      this.#scheduleReconnect(url);
    }

    if (!entry.subscription) {
      handlers.onClosed("relay unavailable");
    }

    return {
      close: () => {
        const current = this.#pool.get(url);
        // dispose() 済み、二重 close、あるいは dispose を挟んで同じ URL が
        // 開き直された場合 — いずれもこの entry は今の集合に居ないので
        // 何もしない。
        if (!current || !current.entries.has(entry)) return;
        current.entries.delete(entry);
        entry.subscription?.close();
        // hold() だけが残っていれば接続は落とさない (Task 3) —
        // ブートストラップがフェーズ間で握り続けている接続を、フェーズ①の
        // 購読が閉じただけで落としてはいけない。
        if (current.entries.size === 0 && current.holds === 0) {
          this.#drop(url);
        }
      },
    };
  }

  /**
   * REQ を出さずに接続だけを確保する。**購読ではない。**
   *
   * ブートストラップ (`bootstrap.ts` の `warmUpRouting`) は、フェーズ①と②の
   * 間でインデクサの接続を落としたくない、という要求を、かつて絶対にマッチ
   * しないフィルタの REQ (`{ ids: [NEVER_MATCHING_ID] }`) で表現していた。
   * これには実地の問題があった (2026-08-05 に real-key run で観測):
   * 一部のリレーがそれを `blocked: filters must specify at least one kind`
   * で CLOSE する — 狙った保持効果がそもそも得られていなかった。この
   * `hold()` はその要求 (「この接続を開けたままにしておけ」) を一級の能力に
   * 引き上げたもの: `connection.subscribe()` を一切呼ばず、ワイヤに何も出さ
   * ずに接続の寿命だけを握る。
   *
   * `#ensureConnection` を通す (`subscribe()`/`publish()` と同じ経路) ので、
   * 予算チェック (ADR-0011) も `#failures` の会計 (Task 2) もそのまま効く。
   * `{ reserved: true }` もそのまま効く — ブートストラップはこれまでどおり
   * 予算を迂回する。枠が無く `reserved` でもなければ `undefined` を返す。
   */
  hold(url: RelayUrl, options?: SubscribeOptions): PooledHold | undefined {
    const pooled = this.#ensureConnection(url, options);
    if (!pooled) return undefined;

    pooled.holds += 1;

    if (!pooled.connection) {
      // subscribe() の対応する分岐 (:439 付近) と同じ理由: この hold のために
      // #ensureConnection が試みた connect() が失敗した場合、ここで
      // #scheduleReconnect を呼ばないと、この URL に subscribe() 由来の
      // エントリが 1 つも無い限り再接続が一度もスケジュールされない
      // (ADR-0021 の「決して諦めない」が hold だけの接続に及ばなくなる)。
      this.#scheduleReconnect(url);
    }

    let released = false;
    return {
      release: () => {
        // 冪等 — 二重に呼ばれても holds を負にしない。二重 release() は
        // 呼び出し元のバグでも起こりうる (bootstrap.ts の finally など)。
        if (released) return;
        released = true;
        const current = this.#pool.get(url);
        // `close()` の対応する分岐と同じ理由 — dispose() を挟んで同じ URL が
        // 開き直された場合、今ここに居るのは別のレコードである。同一性を
        // 確かめずに減らすと、この release() が後から作られた無関係な
        // hold の枠を奪い、まだ握っている呼び出し元の接続を落としてしまう。
        if (!current || current !== pooled) return;
        current.holds -= 1;
        if (current.holds === 0 && current.entries.size === 0) {
          this.#drop(url);
        }
      },
    };
  }

  /**
   * publish 経路。**ソケットを開くのは `subscribe()` と同じ
   * `#ensureConnection()` を通す** — これがこのファイル冒頭のコメントの
   * 「`subscribe()` を通らない経路で接続を開いてはならない」を publish
   * 側でも守るための実装そのもの。予算チェックをここで独自に書き直すと、
   * 一方だけ直されて他方が迂回口のまま残る危険を生む。
   *
   * 新しいソケットが必要なのに予算が埋まっていれば reject する —
   * `{ reserved: true }` はここでは絶対に使わない (ブートストラップ専用、
   * `SubscribeOptions` 参照)。呼び出し元 (`publisher.ts`) はこれを
   * `PublishResult.rejected` に積んで見せる。ADR-0011 は「黙って欠落させて
   * はならない」と定めており、迂回するのではなく失敗を報告することでその
   * 要求を満たす。
   *
   * 既に他の購読がこの URL のソケットを開いている場合はそれに相乗りする —
   * 新しいソケットは増えない。逆に、誰も購読していない URL へ publish
   * だけのために新しく開いた場合は、publish が完了 (成功・失敗いずれも)
   * した時点でこの接続への参照を手放す。一時的な `Entry` (filters 無し、
   * ハンドラは no-op) を `pooled.entries` に足して `subscribe()` と同じ
   * 参照カウントの仕組みに相乗りしているだけで、REQ は一切送らない。
   *
   * **`PUBLISH_TIMEOUT_MS` で必ず決着させる** (final review, Critical 1)。
   * NIP-01 は OK の送信を relay に義務づけるが、レート制限時に EVENT を
   * 黙って捨てる実装が実在する。`WebSocketRelayConnection.publish()` は
   * OK かソケット死亡でしか settle しないので、それ以外の理由でここが
   * 待ち続けると `release()` が一生呼ばれず、30 接続予算のうち 1 本を
   * 誰も購読していないリレーへ永久に握らせたまま `v1-preview.tsx` の
   * `posting` が下りなくなる。タイムアウトは reject と同時に必ず
   * `release()` も行う — 予算を返さない決着の仕方を作らない。
   */
  publish(url: RelayUrl, event: NostrEvent): Promise<void> {
    const pooled = this.#ensureConnection(url);
    if (!pooled) {
      return Promise.reject(
        new Error(`connection budget exhausted for ${url}`),
      );
    }
    if (!pooled.connection) {
      // `#ensureConnection` が connect() を試みて失敗を吸収した後。誰も
      // 購読していないこの URL のために再接続をスケジュールし続ける理由は
      // publish 単独には無い — 今回の publish をここで諦めて報告する。
      //
      // publish は (subscribe と違い) entry を足さないので、このレコードを
      // #pool に残すと誰も待っていない空の Pooled が永遠に残る
      // (ledger deferred minor 2)。他に待っているエントリが無ければここで
      // 片付ける — entries が空でなければ、それは別の subscribe() が
      // 同じ URL への再接続をまだ待っている最中なので触らない。
      //
      // hold() が生きていれば (Task 3) レコードごと消してはいけない —
      // hold() 自身が既に #scheduleReconnect でこの URL への再接続タイマーを
      // 積んでいるはずで、ここでレコードを消すとそのタイマーが発火しても
      // `#reconnect` が `#pool.get(url)` で見つけられず無言で何もせず、
      // hold は二度と接続を取り戻せなくなる。
      if (pooled.entries.size === 0 && pooled.holds === 0) {
        // `#pool.delete` ではなく `#drop` を通す。ここでは `connection` も
        // `offClose` も null なので両者は等価だが、`#drop` は待機中の
        // タイマーも消すため、この分岐の安全性が「タイマーは張られていない
        // はず」という非局所な論証に依存しなくなる。
        this.#drop(url);
      }
      return Promise.reject(new Error(`relay unavailable: ${url}`));
    }
    const connection = pooled.connection;

    const entry: Entry = {
      filters: [],
      handlers: PUBLISH_ONLY_HANDLERS,
      subscription: null,
    };
    pooled.entries.add(entry);

    const release = (): void => {
      const current = this.#pool.get(url);
      if (!current || !current.entries.has(entry)) return;
      current.entries.delete(entry);
      // hold() だけが残っていれば接続は落とさない (Task 3、subscribe() の
      // close() と同じ理由)。
      if (current.entries.size === 0 && current.holds === 0) {
        this.#drop(url);
      }
    };

    return new Promise<void>((resolve, reject) => {
      // OK も死亡通知も来ないまま両方が発火することがある
      // (タイムアウト後にソケットが死ぬ、等) —— 二重に settle させない。
      let settled = false;

      const timer = this.#scheduler.setTimeout(() => {
        if (settled) return;
        settled = true;
        release();
        reject(
          new Error(
            `publish timed out for ${url} after ${PUBLISH_TIMEOUT_MS}ms`,
          ),
        );
      }, PUBLISH_TIMEOUT_MS);

      connection.publish(event).then(
        () => {
          if (settled) return;
          settled = true;
          this.#scheduler.clearTimeout(timer);
          release();
          resolve();
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          this.#scheduler.clearTimeout(timer);
          release();
          reject(error);
        },
      );
    });
  }

  /**
   * 手動再試行 (ADR-0021)。UI は後続タスクで online/visibilitychange に
   * このメソッドを配線する — その配線自体はアプリ側の責務で、読み取り層は
   * DOM イベントを直接掴まない。
   *
   * 待っている全 URL について、保留中のバックオフタイマーを破棄し、
   * 連続失敗回数をリセットしてから即座に `#reconnect()` を試みる。既に
   * 繋がっている URL (`connection` が非 null) はそもそも対象外 —
   * 触ると生きているソケットを無駄に張り直すことになる。
   *
   * 上のループは `#pool` にエントリが残っている URL にしか届かない
   * (Task 2 fix round 1, Minor)。degraded な URL は誰も購読しなくなり
   * 最後のエントリが閉じると `#drop` で `Pooled` が消える — それでも
   * `#failures` は (意図的に) 生き残る。人間がトンネルから復帰して
   * retryNow() を叩いたのに、まさに一番除外されていてほしくない degraded
   * relay だけが 300 秒のクールダウンをそのまま待たされるのでは意味が
   * ない。そこでループの後に `#failures` を丸ごと消す — `retryNow()` は
   * 人間が起こした操作なので、履歴を全部捨ててよい。
   */
  retryNow(): void {
    for (const [url, pooled] of this.#pool) {
      if (pooled.connection) continue;
      if (pooled.timer !== null) {
        this.#scheduler.clearTimeout(pooled.timer);
        pooled.timer = null;
      }
      this.#clearFailures(url);
      this.#reconnect(url);
    }
    // `#failures.clear()` を直に呼ばない —— degraded だった URL は今ここで
    // 集合から出るので、購読者に知らせないと手動再試行が「バックオフだけ
    // 消して選択には反映されない」半端な操作になる。キーはスナップショット
    // を取ってから回す (`#clearFailures` が反復対象の Map を変更する)。
    for (const url of [...this.#failures.keys()]) this.#clearFailures(url);
  }

  /**
   * `#drop` は生きている `Pooled` レコードだけを畳み、`#failures` (失敗
   * 履歴とその冷却タイマー) にはわざと触らない — 購読が残っている間に
   * 履歴だけ消えると Task 4 の degraded 判定が振動する、というのが
   * `#failures` をプール寿命から切り離した理由そのものだから。だが
   * dispose() された後はもう誰も consumer が居ない。ここで
   * `#failures` を放置すると、実タイマーの下では最大 `DEGRADED_COOLDOWN_MS`
   * (5 分) 分の `setTimeout` が dispose 済みプールをクロージャ越しに掴み
   * 続け (Task 2 fix round 1, Important 2)、`SubscriptionManager.dispose()`
   * 経由の Solid プロバイダの teardown のたびにそれが積み上がる。注入した
   * 偽クロックの下でも、後から `advance()` されればそのコールバックは
   * dispose 済みプールの状態を書き換えてしまう — このファイルの他の箇所が
   * 慎重に避けている「dispose 後の状態変更」そのもの。
   */
  dispose(): void {
    for (const url of [...this.#pool.keys()]) this.#drop(url);
    this.#pool.clear();
    // dispose() は復帰ではない。ここを `#clearFailures` に寄せると、
    // 自分より長生きした listener にだけ届く通知を作ることになる
    // (`SubscriptionManager.dispose()` は #offDegraded を先に呼んでから
    // pool.dispose() する)。意図的に直接消す。
    for (const { timer } of this.#failures.values()) {
      this.#scheduler.clearTimeout(timer);
    }
    this.#failures.clear();
  }

  #drop(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled) return;
    // タイマーが残ったまま消すと、閉じたはずのリレーへ永遠に再接続し続ける
    // ゾンビタイマーになる (ADR-0021)。
    if (pooled.timer !== null) this.#scheduler.clearTimeout(pooled.timer);
    pooled.offClose?.();
    pooled.offOpen?.();
    pooled.connection?.close();
    this.#pool.delete(url);
  }

  /**
   * ソケットが自らの意思とは無関係に死んだときの通知先 (`RelayConnection.onClose`)。
   * 予算 (ADR-0021) を即座に解放するが、購読の `onClosed` はここでは呼ばない —
   * 接続側 (`WebSocketRelayConnection.fail()` / `FakeRelayConnection.die()`) が
   * 既に全ハンドラへ配り終えている。二重に呼ぶと `incomplete.unreachableRelays`
   * が二重計上される。
   *
   * 末尾で再接続をスケジュールする (ADR-0021) — 誰も再購読を頼んでいないのに
   * ソケットが死んだままになる状態を作らない。
   */
  #onConnectionDied(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled) return;
    pooled.offClose?.();
    pooled.offClose = null;
    pooled.offOpen?.();
    pooled.offOpen = null;
    pooled.connection = null;
    for (const entry of pooled.entries) entry.subscription = null;
    this.#scheduleReconnect(url);
  }

  /**
   * 指数バックオフ + ジッタで再接続タイマーを積む (ADR-0021)。
   *
   * ジッタが無いと、同時に死んだ 30 本のリレーへの再接続が同期し、復帰の
   * 瞬間に自分でバーストを作ってしまう。`0.5〜1.5` 倍の範囲でずらす。
   */
  /**
   * `reason` は既定で `"relay"` — 呼び出し元のほとんど (`#onConnectionDied`、
   * `subscribe()` の初回失敗、`#reconnect` の `connect()` catch) はリレー
   * 自身に起因する失敗なので、そのままで従来通りの挙動になる。予算超過で
   * 待たされているだけの `#reconnect` の分岐 (`:713` 付近) だけが明示的に
   * `"budget"` を渡す。
   */
  #scheduleReconnect(url: RelayUrl, reason: ReconnectReason = "relay"): void {
    const pooled = this.#pool.get(url);
    if (!pooled || pooled.connection || pooled.timer !== null) return;
    // hold だけの URL も再接続の対象 (Task 3) — 「誰も待っていない」の
    // 「誰か」には hold も含める。
    if (pooled.entries.size === 0 && pooled.holds === 0) return;

    // 指数は「今までの」失敗回数から計算し、その後で今回の失敗を記録する
    // (`#noteFailure` を呼ぶ) — 順序を逆にすると 1 回目の遅延から既に
    // 2 倍されてしまう。
    const count = this.#failures.get(url)?.count ?? 0;
    const base = Math.min(RECONNECT_BASE_MS * 2 ** count, RECONNECT_MAX_MS);
    const delay = base * (0.5 + this.#random());
    this.#noteFailure(url, reason);
    pooled.timer = this.#scheduler.setTimeout(() => {
      pooled.timer = null;
      this.#reconnect(url);
    }, delay);
  }

  /**
   * ソケットが新しく (または再び) 繋がった直後の後始末。`#ensureConnection`
   * (`subscribe()`/`publish()` からの新規接続) と `#reconnect()` (死んだ
   * 接続の張り直し) の両方がここを通る — 一本化する前は `#ensureConnection`
   * だけがこれをやっておらず、接続を蘇らせても保留中の再接続タイマーを
   * 消さず、待っているエントリの REQ も張り直さなかった (final review,
   * Critical 2)。
   *
   * 具体的な壊れ方: あるカラムが購読していたリレー R が死に、
   * `#onConnectionDied` が全エントリの `subscription` を null にして
   * バックオフタイマーを積む。タイマーが発火する前にユーザーが投稿し、
   * R が write リレーの 1 つだったため `publish()` が `#ensureConnection`
   * 経由で R への新しいソケットを開く。ここで待機タイマーを消さず REQ も
   * 張り直さないと、後からタイマーが発火した `#reconnect()` は
   * `pooled.connection` が非 null であることだけを見て早期リターンし
   * (タイマーは既に消費済みなので何も再登録されない)、カラムの REQ は
   * 二度と送られない — ソケット自体は生きているので
   * `#onConnectionDied` も二度と起きず、カラムはページの寿命が尽きるまで
   * 沈黙する。ADR-0021 の「決して諦めない」を守るには、蘇らせた主体が
   * どちらであっても同じ状態に揃える必要がある。
   *
   * 待っているタイマーを消す・全エントリの REQ を (`subscription` の
   * 現在値に関わらず) 張り直す、の 2 つを必ずセットで行う。`entry.subscription`
   * が既に生きているケースは無い — このメソッドが呼ばれるのは
   * `pooled.connection` が null だった (= 全エントリの `subscription` も
   * `#onConnectionDied` か初期状態で既に null の) 場合だけなので、無条件の
   * 張り直しで安全。
   *
   * バックオフの失敗カウンタ (`#failures`) はここでは触らない —
   * `connect()` が例外を投げずに返った (= ソケットオブジェクトが作れた)
   * だけでは「繋がった」ことにならない。実際に開いた証拠は `onOpen` の
   * 発火だけであり、`#clearFailures` はその中でのみ呼ぶ (2026-08-05 に
   * 実地観測された、恒久的に到達不能なリレーへ指数バックオフが一度も
   * 伸びない欠陥の直接の原因がここだった)。
   */
  #attachConnection(
    url: RelayUrl,
    pooled: Pooled,
    connection: RelayConnection,
  ): void {
    if (pooled.timer !== null) {
      this.#scheduler.clearTimeout(pooled.timer);
      pooled.timer = null;
    }
    // 古い offOpen が残っていれば (通常は #onConnectionDied 経由で既に
    // null になっているはずだが、offClose と同じ扱いで念のため) 先に
    // 解除してから張り直す。
    pooled.offOpen?.();
    pooled.connection = connection;
    pooled.offClose = connection.onClose(() => this.#onConnectionDied(url));
    pooled.offOpen = connection.onOpen(() => this.#clearFailures(url));
    this.#recordPeak();

    for (const entry of pooled.entries) {
      try {
        entry.subscription = connection.subscribe(
          entry.filters,
          entry.handlers,
        );
      } catch {
        entry.subscription = null;
        // 呼び出し先は任意の消費者コード (セクション) であり、ここは複数
        // エントリを 1 つのループで処理している。無防備に呼ぶと、1 つの
        // セクションのコールバックが投げただけで、まだ張り直していない
        // 残りのエントリが REQ 無しのまま取り残される —— ソケットは生きて
        // いるので `#onConnectionDied` も二度と起きず、そのカラムはページの
        // 寿命が尽きるまで沈黙する (ADR-0011 が禁じる隠れた劣化)。
        // `SubscriptionManager.#deliver` / `SectionReader.#notify` と同じ
        // 作法: 専用の報告チャネルは無いので console.error に落とす。主目的
        // は隔離であって報告ではない。
        try {
          entry.handlers.onClosed("relay unavailable");
        } catch (error) {
          console.error(
            "ConnectionPool: an onClosed handler threw while re-attaching; isolating it so the remaining entries keep their subscriptions.",
            error,
          );
        }
      }
    }
  }

  /**
   * 実際の再接続の試行。失敗しても外へは投げない — 呼び出し元 (タイマー・
   * `retryNow()`) は同期的な戻り値以外の失敗経路を持たないので、ここで
   * 吸収してバックオフを積み直す (プールは何をやっても例外を投げない、と
   * いう既存の保証を再接続でも保つ)。
   *
   * 切断中に流れたイベントを `since` で埋めない: 元のフィルタをそのまま
   * 張り直す。スリープ復帰で数時間分を `since` で埋めると、500 件上限
   * (ADR-0011) を即座に食いつぶし、ユーザーが実際に見ていたものを押し出す。
   * 元のフィルタが持つ `limit` を使って最新 N 件を取り直せば十分で、
   * 間を埋めるのはページネーションの役目 (`EventStore` が重複を吸収する)。
   *
   * `connect()` の失敗と `connection.subscribe()` の失敗を分けて扱う —
   * `subscribe()` (新規購読の経路) と同じ区別。前者はソケットそのものが
   * 使えないので丸ごと再試行、後者は「ソケットは生きているが特定の REQ
   * だけ失敗した」なので、その接続は保持したまま該当エントリだけ
   * `onClosed` で報告する。ここを一つの try/catch にまとめてしまうと、
   * 複数エントリが相乗りしている再接続で 1 エントリの REQ 失敗が原因で
   * せっかく繋がった生きているソケットごと巻き戻ってしまう。
   */
  #reconnect(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    // hold だけの URL も再接続の対象 (Task 3、#scheduleReconnect のガードと
    // 同じ理由)。
    if (
      !pooled ||
      pooled.connection ||
      (pooled.entries.size === 0 && pooled.holds === 0)
    ) {
      return;
    }

    // 枠が無ければ諦めず、あとでもう一度試す。生きている接続から枠を
    // 奪ってはいけない (ADR-0021)。`{ reserved: true }` で開いたエントリ
    // (Task 11, ブートストラップ専用) もここでは特別扱いしない —
    // 予約は最初の `subscribe()` 呼び出し限りで、死んで再接続待ちになった
    // 後まで持ち越さない。許容できるのは、ここで待たされている間
    // `collect()` のタイムアウトがその URL を見限って settle させ、
    // 対応する `PooledSubscription.close()` が待っているエントリを消して
    // `#scheduleReconnect` の「誰も待っていない」ガードで止まるから —
    // 予約を再接続にまで広げるより、ハングせず縮退させる方を選んだ。
    if (this.size >= this.#maxConnections) {
      // "budget" -- this bounce says nothing about this relay's own health
      // (Task 2 fix round 1, Important 1). The backoff still has to grow
      // (a URL stuck behind a saturated budget must not spin at the base
      // interval forever), but it must not count toward `degradedRelays`,
      // or a relay that has never once failed to connect gets excluded
      // from selection purely because another relay was holding the slot.
      this.#scheduleReconnect(url, "budget");
      return;
    }

    let connection: RelayConnection;
    try {
      connection = this.#options.connect(url);
    } catch {
      // `#noteFailure` はここでは呼ばない — 直後の `#scheduleReconnect` が
      // 必ず呼ぶので、ここでも呼ぶと同じ 1 回の失敗を二重に計上してしまう
      // (`#ensureConnection` の catch 節と同じ理由)。
      this.#scheduleReconnect(url);
      return;
    }

    this.#attachConnection(url, pooled, connection);
  }
}
