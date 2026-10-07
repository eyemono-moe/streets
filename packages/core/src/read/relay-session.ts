import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";

/**
 * 再接続タイマーの注入口。ハンドル型を `typeof setTimeout` の戻り値にして
 * いるのは、DOM lib (`number`) でも Node lib (`NodeJS.Timeout`) でも通すため。
 */
export type Scheduler = {
  setTimeout: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  /**
   * 現在時刻 (ミリ秒エポック)。鮮度判定は分岐に使うので、タイマーと同じく
   * 注入できなければテストが時間を決められない。
   */
  now: () => number;
};

/** 「注入されなければ実タイマー」という規約の既定値。 */
export const defaultScheduler: Scheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
  now: () => Date.now(),
};

export type SessionSubscription = { close(): void };

/**
 * `hold()` が返すハンドル。`SessionSubscription` と違い `subscription` を
 * 一切持たない — hold は REQ を出さない (`hold()` のコメント参照)。
 */
export type SessionHold = { release(): void };

/** コールバックで書き換わりうる状態を、型の絞り込みを通さずに読む。 */
const isDone = (entry: { state: string }): boolean => entry.state === "done";

/**
 * NIP-11 で上限が分からないリレーの同時購読の枠。他のクライアントの既定でもあり、
 * strfry の既定 (20) とも合う。NIP-11 を取って上限が書いていないと分かったリレーだけが枠なしになる。
 */
export const DEFAULT_MAX_SUBSCRIPTIONS = 20;

/**
 * 同じ購読が NOTICE で戻された回数の上限。超えたら送り直さず、欠けとして伝える。
 * 枠が空くまで待たせるので通常は届かないが、リレーの数え方が食い違い続けたときに、
 * 保存済みのイベントを往復ごとに受け直さないための歯止め。
 */
export const MAX_NOTICE_REFUSALS = 3;

/** 接続が死んだときに全購読へ配る理由。枠の学習の対象にはしない。 */
const SOCKET_CLOSED = "socket closed";

/** リレーが同時購読の上限で REQ を断るときの文面（strfry は NOTICE、CLOSED で返すものもある）。 */
const isSubscriptionLimitMessage = (message: string): boolean =>
  message.toLowerCase().includes("too many concurrent");

/**
 * 最後の購読が閉じた接続を、閉じずに残しておく時間。一度きりの取得（プロフィール、
 * 反応の数など）のたびに開閉すると TLS と NIP-42 認証をやり直すことになる。
 * リレーは購読 1 本で 4 分置いても切らないので、短い猶予で十分に繋ぎ直しを減らせる。
 */
export const IDLE_LINGER_MS = 30_000;

const RECONNECT_BASE_MS = 1_000;
/** 指数バックオフの上限。ここで頭打ちにしても諦めずに回し続ける。 */
const RECONNECT_MAX_MS = 60_000;

/**
 * NIP-01 は OK 送信を義務づけるが、レート制限時に黙って捨てる relay が
 * 実在し、`publish()` は OK かソケット死亡でしか settle しないため必要。
 */
export const PUBLISH_TIMEOUT_MS = 10_000;

/**
 * `publish()` が接続の参照カウントに相乗りするための一時 `Entry` 用ハンドラ。
 * REQ を送らないので呼ばれず、`#reconnect()` の引き直しの失敗も黙って吸収する。
 */
const PUBLISH_ONLY_HANDLERS: RelaySubscriptionHandlers = {
  onEvent: () => {},
  onEose: () => {},
  onClosed: () => {},
};

/**
 * `count` はどちらの理由でも増えるが、`hard` (degraded 判定) は `"relay"`
 * のときだけ増える。予算超過のバウンスを混ぜると健全なリレーまで degraded 判定される。
 */
export type ReconnectReason = "relay" | "budget";

/**
 * 窓口が接続の予算・失敗の記録・学んだ枠を持つ側（プール）に頼む口。窓口は閉じても
 * これらを失ってはいけない（失敗の履歴や学んだ枠は、猶予が切れて窓口が消えても残す）。
 */
export type RelaySessionOptions = {
  url: RelayUrl;
  scheduler: Scheduler;
  random: () => number;
  connect: () => RelayConnection;
  /** 新しい接続を 1 本開ける枠を作る。作れなければ false。 */
  makeRoom: () => boolean;
  failureCount: () => number;
  noteFailure: (reason: ReconnectReason) => void;
  clearFailures: () => void;
  /** ソケットを実際に作った直後。接続数の最大値を取り逃さないため。 */
  onConnected: () => void;
  /** NIP-11 の `max_subscriptions`。これを渡さない窓口は、断られて学んだ枠だけを持つ。 */
  declaredLimit?: () => number | null | undefined;
  learnedLimit: () => number | undefined;
  learn: (limit: number) => void;
  /** 同時購読の枠が埋まっていて、REQ を送らず待たせた。 */
  onQueued: () => void;
  /** 窓口が閉じた（猶予切れなど）。表から外してもらう。 */
  onClosed: () => void;
};

/** 1 本の `subscribe()` 呼び出しに対応する登録。 */
type Entry = {
  filters: RelayFilter[];
  handlers: RelaySubscriptionHandlers;
  subscription: RelaySubscription | null;
  /** EOSE で終わる一度きりの取得か。 */
  once: boolean;
  /**
   * `queued` は REQ を送る順番待ち（枠が無い・接続が無い）、`sent` は送って枠を
   * 使っている、`closed` はリレーが CLOSED を返した、`done` は一度きりの取得が
   * EOSE で終わった（publish 用の仮の記録も `done`）。数えるのは `sent` だけ。
   */
  state: "queued" | "sent" | "closed" | "done";
  /** 待たせたことを数え済みか。 */
  waited: boolean;
  /**
   * NOTICE で戻されて、枠が実際に空くまで送らない印。すぐ送り直すと、リレーの数え方と
   * 食い違うとき保存済みのイベントを往復ごとに受け直すことになる。
   */
  parked: boolean;
  /** NOTICE で戻された回数。 */
  refusals: number;
};

/**
 * リレー 1 本ぶんの窓口。接続の作成と張り直し、使い終わった接続の猶予、購読の枠と
 * 待ち行列、断りの解釈、認証の張り直しを持つ。接続の予算は持たず、プールに頼む。
 * 接続が `null` でも、待つ人が居る間は窓口はこの URL を諦めず、再接続の対象として残る。
 */
export class RelaySession {
  readonly #options: RelaySessionOptions;
  #connection: RelayConnection | null = null;
  readonly #entries = new Set<Entry>();
  /** 接続の死亡通知の購読解除。`#connection` が非 null の間だけ非 null。 */
  #offClose: (() => void) | null = null;
  /**
   * ソケットが実際に開いた通知の購読解除 (`#offClose` と同じ規約)。`connect()`
   * が返っただけでは証拠にならないので、失敗の記録を消すのはこの発火時だけ。
   */
  #offOpen: (() => void) | null = null;
  /**
   * 保留中の再接続タイマー。接続済み、または待つエントリが無い間は必ず
   * `null` — 残ったままだと誰も待っていないリレーへ再接続し続ける。
   */
  #timer: ReturnType<Scheduler["setTimeout"]> | null = null;
  /**
   * `{ reserved: true }` で少なくとも 1 回要求されたか。`selectRelays` の
   * `pinned` とは別物 —— こちらは予算チェックそのものを迂回する側。
   */
  #reserved = false;
  /**
   * `hold()` が保持している数。`#entries` とは独立したカウンタで、
   * `#entries` が 0 になっても残っていれば接続は落とさない。
   */
  #holds = 0;
  /**
   * 最後に EOSE を受けた購読。strfry は上限を超えた REQ にも保存済みの
   * イベントと EOSE を返したあとで NOTICE を返すので、NOTICE の対象はこれ。
   */
  #lastEosed: Entry | null = null;
  /**
   * entries も holds も 0 になって、猶予の間だけ開いている間は非 null。
   * `since` は枠が足りないときに古い順で閉じるための記録。
   */
  #linger: {
    timer: ReturnType<Scheduler["setTimeout"]>;
    since: number;
  } | null = null;
  #closed = false;

  constructor(options: RelaySessionOptions) {
    this.#options = options;
  }

  get hasConnection(): boolean {
    return this.#connection !== null;
  }

  get reserved(): boolean {
    return this.#reserved;
  }

  /** 接続があり、猶予中でもない。 */
  get inUse(): boolean {
    return this.#connection !== null && this.#linger === null;
  }

  /** 猶予に入った時刻。猶予中の接続でなければ `null`。 */
  get lingeringSince(): number | null {
    return this.#connection && this.#linger ? this.#linger.since : null;
  }

  /**
   * 購読・hold・publish の共通の入口。猶予を取り消し、接続が無ければ予算を確かめて
   * 開く。予算チェックとソケット生成を一本化しないと、片方だけ直されて迂回する経路が残る。
   * 予算が無ければ false。
   */
  ensureConnected(reserved: boolean): boolean {
    this.#cancelLinger();
    if (!this.#connection) {
      if (!reserved && !this.#options.makeRoom()) return false;
      try {
        // `#reconnect()` と「接続が繋がった直後」の後始末を揃える — `#attachConnection` 参照。
        this.#attachConnection(this.#options.connect());
      } catch {
        // connection は null のまま (再接続対象として残す)。`noteFailure` は
        // ここでは呼ばない —— 呼び出し元が直後に必ず `#scheduleReconnect` を
        // 呼ぶので、二重計上になる。
      }
    }
    // 一度でも reserved で要求されたら、この窓口が生きている間は reserved として数える。
    // 窓口ごと消えれば、次に作られる窓口は false に戻る。
    if (reserved) this.#reserved = true;
    return true;
  }

  /**
   * 購読 (REQ) の経路。接続や購読の確立に失敗しても例外は外に投げず、
   * `handlers.onClosed(...)` に変換して伝える (呼び出し元を壊さないため)。
   */
  subscribe(
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
    options?: { once?: boolean },
  ): SessionSubscription {
    const entry: Entry = {
      filters,
      handlers,
      subscription: null,
      once: options?.once ?? false,
      state: "queued",
      waited: false,
      parked: false,
      refusals: 0,
    };
    this.#entries.add(entry);

    if (this.#connection) {
      // 枠が空いていればすぐ送り、埋まっていれば順番待ちに残る。待っている間も
      // 呼び出し元から見れば開いている購読で、close() は待ち行列から外すだけ。
      this.#pump();
    } else {
      // connect() が失敗した場合。呼ばないと、一度も繋がったことのない
      // relay は #onConnectionDied を経由しないので再試行が一切積まれない。
      this.#scheduleReconnect();
      handlers.onClosed("relay unavailable");
    }

    return {
      close: () => {
        // 窓口ごと閉じた後、二重 close、あるいは閉じた後に同じ URL が別の窓口で
        // 開き直された場合 — いずれもこの entry は今の集合に居ないので何もしない。
        if (this.#closed || !this.#entries.has(entry)) return;
        this.#entries.delete(entry);
        entry.subscription?.close();
        // 空いた枠で、待っている購読を送る。
        this.#unpark();
        this.#pump();
        // hold() だけが残っていれば接続は落とさない — ブートストラップが
        // フェーズ間で握り続けている接続を、フェーズ①の購読が閉じただけで
        // 落としてはいけない。
        this.#releaseIfIdle();
      },
    };
  }

  /**
   * REQ を出さずに接続だけを確保する。**購読ではない。** 一部のリレーは
   * 絶対にマッチしないフィルタの REQ を `blocked` で CLOSE するため必要。
   */
  hold(): SessionHold {
    this.#holds += 1;

    if (!this.#connection) {
      // subscribe() の対応する分岐と同じ理由: この hold のために開こうとした
      // connect() が失敗した場合、ここで #scheduleReconnect を呼ばないと、
      // subscribe() 由来のエントリが 1 つも無い限り再接続が一度もスケジュールされない。
      this.#scheduleReconnect();
    }

    let released = false;
    return {
      release: () => {
        // 冪等 — 二重に呼ばれても holds を負にしない。二重 release() は
        // 呼び出し元のバグでも起こりうる (bootstrap.ts の finally など)。
        if (released) return;
        released = true;
        // 閉じた後に同じ URL が別の窓口で開き直された場合、その窓口の hold を
        // この release() が奪ってはいけない。
        if (this.#closed) return;
        this.#holds -= 1;
        this.#releaseIfIdle();
      },
    };
  }

  /**
   * publish 経路。タイムアウトは reject と同時に必ず `release()` も行う ——
   * 接続を返さない決着の仕方を作らない。`ensureConnected()` のあとに呼ぶ。
   */
  publish(event: NostrEvent): Promise<void> {
    const connection = this.#connection;
    const { url, scheduler } = this.#options;
    if (!connection) {
      // connect() が失敗を吸収した後。publish は entry を足さないので、
      // 誰も待っていなければここで片付ける (hold() が生きていれば
      // 自身のタイマーが `#reconnect` を見つけられなくなるので消さない)。
      if (this.#entries.size === 0 && this.#holds === 0) this.close();
      return Promise.reject(new Error(`relay unavailable: ${url}`));
    }

    const entry: Entry = {
      filters: [],
      handlers: PUBLISH_ONLY_HANDLERS,
      subscription: null,
      once: false,
      state: "done",
      waited: false,
      parked: false,
      refusals: 0,
    };
    this.#entries.add(entry);

    const release = (): void => {
      if (this.#closed || !this.#entries.has(entry)) return;
      this.#entries.delete(entry);
      // hold() だけが残っていれば接続は落とさない (subscribe() の close()
      // と同じ理由)。
      this.#releaseIfIdle();
    };

    return new Promise<void>((resolve, reject) => {
      // OK も死亡通知も来ないまま両方が発火することがある
      // (タイムアウト後にソケットが死ぬ、等) —— 二重に settle させない。
      let settled = false;

      const timer = scheduler.setTimeout(() => {
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
          scheduler.clearTimeout(timer);
          release();
          resolve();
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          scheduler.clearTimeout(timer);
          release();
          reject(error);
        },
      );
    });
  }

  /** 手動再試行。バックオフを破棄し、失敗の記録を消して即座に再接続を試みる。 */
  retryNow(): void {
    if (this.#connection) return;
    if (this.#timer !== null) {
      this.#options.scheduler.clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#options.clearFailures();
    this.#reconnect();
  }

  /**
   * 認証を試みた接続を張り直す。リレーは認証した鍵をソケットが閉じるまで覚えて
   * いるので、アカウントを替えたのに同じソケットを使い続けると、前のアカウント
   * として読み書きできてしまう。購読は新しい接続へそのまま移す。
   */
  resetAuthentication(): void {
    const connection = this.#connection;
    if (!connection?.authAttempted) return;
    // 猶予中なら張り直す相手が居ない。閉じて、次に使うときに新しく開く。
    if (this.#linger) {
      this.close();
      return;
    }
    // 先に購読を閉じておく。閉じずに捨てると、古いソケットの死が
    // 新しい接続へ移した購読に onClosed を配ってしまう。
    for (const entry of this.#entries) entry.subscription?.close();
    this.#requeueAll();
    this.#detachConnection();
    connection.close();
    this.#reconnect();
  }

  /**
   * 窓口を閉じる。`reason` を渡すと、待っていた購読にも `onClosed` を配る —— 配らないと
   * 一度きりの取得がタイムアウトまで待ち続ける。
   */
  close(reason?: string): void {
    if (this.#closed) return;
    this.#closed = true;
    const entries = reason === undefined ? [] : [...this.#entries];
    // ソケットの死より先に購読を外す。外さないと、閉じたソケットからも
    // 遅れて onClosed が届き、二重に数えられる。
    for (const entry of entries) {
      entry.subscription?.close();
      entry.subscription = null;
    }
    // タイマーが残ったまま消すと、閉じたはずのリレーへ永遠に再接続し続ける
    // ゾンビタイマーになる。
    if (this.#timer !== null) this.#options.scheduler.clearTimeout(this.#timer);
    this.#timer = null;
    this.#cancelLinger();
    const connection = this.#connection;
    this.#detachConnection();
    connection?.close();
    this.#options.onClosed();
    for (const entry of entries) {
      try {
        entry.handlers.onClosed(reason ?? "");
      } catch (error) {
        console.error(
          "RelaySession: an onClosed handler threw while closing a session; isolating it so the remaining entries are still notified.",
          error,
        );
      }
    }
  }

  #detachConnection(): void {
    this.#offClose?.();
    this.#offClose = null;
    this.#offOpen?.();
    this.#offOpen = null;
    this.#connection = null;
  }

  /**
   * ソケットが自らの意思とは無関係に死んだときの通知先。`onClosed` はここでは
   * 呼ばない —— 接続側が既に配り終えているので、二重に呼ぶと二重計上される。
   */
  #onConnectionDied(): void {
    if (this.#closed) return;
    this.#detachConnection();
    this.#requeueAll();
    // 猶予中の接続が死んだなら、誰も待っていないので再接続しない。残すと、
    // 接続の無い記録が枠を食い続ける。
    if (this.#linger) {
      this.close();
      return;
    }
    this.#scheduleReconnect();
  }

  /**
   * 使う人が居なくなった接続を、すぐ閉じずに `IDLE_LINGER_MS` だけ残す。
   * 接続が無い記録は残す理由が無いのでその場で片付ける。
   */
  #releaseIfIdle(): void {
    if (this.#entries.size > 0 || this.#holds > 0) return;
    if (!this.#connection) {
      this.close();
      return;
    }
    if (this.#linger) return;
    const { scheduler } = this.#options;
    this.#linger = {
      since: scheduler.now(),
      timer: scheduler.setTimeout(() => this.close(), IDLE_LINGER_MS),
    };
  }

  #cancelLinger(): void {
    if (!this.#linger) return;
    this.#options.scheduler.clearTimeout(this.#linger.timer);
    this.#linger = null;
  }

  /**
   * 指数バックオフ + ジッタで再接続タイマーを積む。ジッタが無いと、同時に
   * 死んだ複数リレーの再接続が同期し復帰の瞬間にバーストを作ってしまう。
   */
  #scheduleReconnect(reason: ReconnectReason = "relay"): void {
    if (this.#closed || this.#connection || this.#timer !== null) return;
    // hold だけの URL も再接続の対象 — 「誰も待っていない」の「誰か」には
    // hold も含める。
    if (this.#entries.size === 0 && this.#holds === 0) return;

    // 指数は「今までの」失敗回数から計算し、その後で今回の失敗を記録する
    // (`noteFailure` を呼ぶ) — 順序を逆にすると 1 回目の遅延から既に
    // 2 倍されてしまう。
    const count = this.#options.failureCount();
    const base = Math.min(RECONNECT_BASE_MS * 2 ** count, RECONNECT_MAX_MS);
    const delay = base * (0.5 + this.#options.random());
    this.#options.noteFailure(reason);
    this.#timer = this.#options.scheduler.setTimeout(() => {
      this.#timer = null;
      this.#reconnect();
    }, delay);
  }

  /**
   * `ensureConnected()` と `#reconnect()` の両方がここを通る —— 怠ると
   * 蘇らせても REQ が張り直されず、ソケットは生きたままカラムが沈黙する。
   */
  #attachConnection(connection: RelayConnection): void {
    if (this.#timer !== null) {
      this.#options.scheduler.clearTimeout(this.#timer);
      this.#timer = null;
    }
    // 古い offOpen が残っていれば (通常は #onConnectionDied 経由で既に
    // null になっているはずだが、offClose と同じ扱いで念のため) 先に
    // 解除してから張り直す。
    this.#offOpen?.();
    this.#connection = connection;
    const offClose = connection.onClose(() => this.#onConnectionDied());
    const offNotice = connection.onNotice?.((message) =>
      this.#onNotice(message),
    );
    // 呼び出し側は `#offClose` を呼ぶだけで両方を外せる。
    this.#offClose = () => {
      offClose();
      offNotice?.();
    };
    this.#offOpen = connection.onOpen(() => this.#options.clearFailures());
    this.#options.onConnected();

    this.#pump();
  }

  /** 接続が替わる・死ぬと、リレー側の購読は無くなる。全部を送り直す順番待ちに戻す。 */
  #requeueAll(): void {
    this.#lastEosed = null;
    for (const entry of this.#entries) {
      entry.subscription = null;
      entry.waited = false;
      entry.parked = false;
      if (entry.state !== "done") entry.state = "queued";
    }
  }

  /**
   * 同時購読の枠。NIP-11 の値（分からなければ既定値）と、断られて学んだ値の
   * 厳しい方。NIP-11 で枠なしと分かったリレーは、学んだ値だけが枠になる。
   */
  #limit(): number | undefined {
    const learned = this.#options.learnedLimit();
    if (!this.#options.declaredLimit) return learned;
    const declared = this.#options.declaredLimit();
    if (declared === null) return learned;
    const base = declared ?? DEFAULT_MAX_SUBSCRIPTIONS;
    return learned === undefined ? base : Math.min(base, learned);
  }

  /**
   * 枠が空いている間、待っている購読を送る。流し続ける購読を、一度きりの取得より
   * 先に通す（カラムが欠けるより、反応の数が少し遅れる方がよい）。
   */
  #pump(): void {
    if (this.#closed) return;
    for (;;) {
      const connection = this.#connection;
      if (!connection) return;
      let next: Entry | undefined;
      for (const entry of this.#entries) {
        if (entry.state !== "queued" || entry.parked) continue;
        if (!entry.once) {
          next = entry;
          break;
        }
        next ??= entry;
      }
      if (!next) return;

      const limit = this.#limit();
      if (limit !== undefined && this.#openCount() >= limit) {
        for (const entry of this.#entries) {
          if (entry.state !== "queued" || entry.waited) continue;
          entry.waited = true;
          this.#options.onQueued();
        }
        return;
      }
      this.#send(connection, next);
    }
  }

  #openCount(): number {
    let open = 0;
    for (const entry of this.#entries) {
      if (entry.state === "sent") open += 1;
    }
    return open;
  }

  #send(connection: RelayConnection, entry: Entry): void {
    entry.state = "sent";
    const { handlers } = entry;
    try {
      entry.subscription = connection.subscribe(entry.filters, {
        onEvent: (event) => handlers.onEvent(event),
        onEose: () => this.#onEose(entry),
        onClosed: (reason) => this.#onEntryClosed(entry, reason),
      });
      // 同期的に EOSE が届いた一度きりの取得は、ここで初めて閉じられる。
      if (isDone(entry)) {
        entry.subscription.close();
        entry.subscription = null;
      }
    } catch {
      entry.subscription = null;
      entry.state = "closed";
      // 複数エントリを 1 つのループで処理しているので、無防備に呼ぶと
      // 1 つが投げただけで残りが REQ 無しのまま取り残される。隔離が主目的。
      try {
        handlers.onClosed("relay unavailable");
      } catch (error) {
        console.error(
          "RelaySession: an onClosed handler threw while sending a REQ; isolating it so the remaining entries keep their subscriptions.",
          error,
        );
      }
    }
  }

  #onEose(entry: Entry): void {
    if (entry.state === "sent") {
      this.#lastEosed = entry;
      if (entry.once) {
        // 一度きりの取得は EOSE で用が済む。呼び出し元が閉じるのを待たずに枠を返す。
        entry.state = "done";
        entry.subscription?.close();
        entry.subscription = null;
        this.#unpark();
      }
    }
    try {
      entry.handlers.onEose();
    } finally {
      this.#pump();
    }
  }

  #onEntryClosed(entry: Entry, reason: string): void {
    // ソケットの死は `#onConnectionDied` が全購読を順番待ちに戻す。ここで
    // 枠を空けると、死んだ接続へ待っている購読を送ってしまう。
    if (reason === SOCKET_CLOSED) {
      entry.handlers.onClosed(reason);
      return;
    }
    if (
      entry.state === "sent" &&
      isSubscriptionLimitMessage(reason) &&
      this.#refuse(entry)
    ) {
      // 上限で断られただけなので呼び出し元には伝えず、枠が空くまで待たせる。
      this.#pump();
      return;
    }
    if (entry.state === "sent") entry.state = "closed";
    this.#unpark();
    try {
      entry.handlers.onClosed(reason);
    } finally {
      this.#pump();
    }
  }

  /**
   * strfry は上限を超えた REQ にも、保存済みのイベントと EOSE は返す。そのあとで
   * NOTICE を返し、断るのは流し続ける部分（新しいイベント）だけ。なので断られたのは
   * 直前に EOSE を受けた購読。一度きりの取得ならもう取れているので何もせず、流し続ける
   * 購読なら新しいイベントが届かないので、閉じて順番待ちに戻す。
   *
   * 枠を学ぶのは NIP-11 に上限が無い（取れない）リレーだけ。バーストの最中はこちらの
   * `sent` の数がリレー側より多いので、数えた値から学ぶと低く覚えすぎる。下げすぎない
   * よう、既定値を下限にする。
   */
  #onNotice(message: string): void {
    if (!isSubscriptionLimitMessage(message)) return;
    if (this.#closed) return;
    const target = this.#lastEosed;
    this.#lastEosed = null;
    if (!target || target.state !== "sent") return;
    const open = this.#openCount();
    if (open < 2) return;
    if (typeof this.#options.declaredLimit?.() !== "number") {
      this.#options.learn(Math.max(open - 1, DEFAULT_MAX_SUBSCRIPTIONS));
    }
    this.#requeue(target);
    target.refusals += 1;
    if (target.refusals > MAX_NOTICE_REFUSALS) {
      // 何度戻しても断られる。送り直さず、流れない購読として呼び出し元に伝える。
      target.state = "closed";
      try {
        target.handlers.onClosed(
          "too many concurrent REQs: gave up after repeated refusals",
        );
      } catch (error) {
        console.error(
          "RelaySession: an onClosed handler threw while giving up a refused REQ.",
          error,
        );
      }
    } else {
      target.parked = true;
      target.waited = true;
      this.#options.onQueued();
    }
    this.#pump();
  }

  /** 枠が実際に空いた出来事のあとで、NOTICE で戻した購読を送れるようにする。 */
  #unpark(): void {
    for (const entry of this.#entries) entry.parked = false;
  }

  /**
   * CLOSED で上限を理由に断られた `entry` を順番待ちに戻し、枠を「いま開いている数 − 1」へ
   * 下げて覚える。開いているのが 1 本だけなら上限のせいとは言えず、戻しても同じ断られ方を
   * 繰り返すので、何もせず false を返す（戻すたびに枠は 1 つ減るので、繰り返しは
   * 枠が 1 になるまでで止まる）。
   */
  #refuse(entry: Entry): boolean {
    const open = this.#openCount();
    if (open < 2) return false;
    this.#options.learn(open - 1);
    this.#requeue(entry);
    return true;
  }

  #requeue(entry: Entry): void {
    // 閉じておく。残すと、あとで届く古い REQ への応答がこの記録を動かす。
    entry.subscription?.close();
    entry.subscription = null;
    entry.state = "queued";
    entry.waited = false;
  }

  /**
   * 実際の再接続の試行。失敗は外へ投げず吸収してバックオフを積み直す。
   * `since` で埋めず元のフィルタを張り直すのは、500 件上限を食いつぶさないため。
   */
  #reconnect(): void {
    // hold だけの URL も再接続の対象 (#scheduleReconnect のガードと同じ理由)。
    if (
      this.#closed ||
      this.#connection ||
      (this.#entries.size === 0 && this.#holds === 0)
    ) {
      return;
    }

    // 枠が無ければ諦めず後で再試行する (生きている接続から奪わない)。
    // `{ reserved: true }` はここでは特別扱いしない —— 予約は最初の
    // `subscribe()` 呼び出し限りで、待てなければ `collect()` のタイムアウトが縮退させる。
    if (!this.#options.makeRoom()) {
      // 予算超過はこのリレー自身の健全性とは無関係 (`ReconnectReason` 参照)。
      this.#scheduleReconnect("budget");
      return;
    }

    let connection: RelayConnection;
    try {
      connection = this.#options.connect();
    } catch {
      // `noteFailure` はここでは呼ばない — 直後の `#scheduleReconnect` が
      // 必ず呼ぶので、ここでも呼ぶと同じ 1 回の失敗を二重に計上してしまう
      // (`ensureConnected` の catch 節と同じ理由)。
      this.#scheduleReconnect();
      return;
    }

    this.#attachConnection(connection);
  }
}
