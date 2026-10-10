import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import type { Scheduler } from "./scheduler";

export type SessionSubscription = { close(): void };

export type SessionHold = { release(): void };

/** コールバックで書き換わった状態を、型の絞り込みに邪魔されず読むため。 */
const isDone = (entry: { state: string }): boolean => entry.state === "done";

/**
 * NIP-11 で上限が分からないリレーを枠なしにしないのは、strfry の既定 (20) を超えて
 * 断られるため。枠なしになるのは、NIP-11 を取って上限が書いていないと分かったリレーだけ。
 */
export const DEFAULT_MAX_SUBSCRIPTIONS = 20;

/**
 * 通常は届かない。リレーの数え方が食い違い続けたときに、保存済みのイベントを
 * 往復ごとに受け直さないための歯止め。
 */
export const MAX_NOTICE_REFUSALS = 3;

/** 接続の死は上限の断りではないので、枠の学習の対象にしない。 */
const SOCKET_CLOSED = "socket closed";

/** strfry は NOTICE、CLOSED で返すリレーもある。コード番号が無いので文面で見る。 */
const isSubscriptionLimitMessage = (message: string): boolean =>
  message.toLowerCase().includes("too many concurrent");

/**
 * 一度きりの取得（プロフィール、反応の数など）のたびに閉じると TLS と NIP-42 認証を
 * やり直すことになる。リレーは購読 1 本で 4 分置いても切らないので、短い猶予で足りる。
 */
export const IDLE_LINGER_MS = 30_000;

const RECONNECT_BASE_MS = 1_000;
/** 指数バックオフの上限。ここで頭打ちにしても諦めずに回し続ける。 */
const RECONNECT_MAX_MS = 60_000;

/**
 * NIP-01 は OK 送信を義務づけるが、レート制限時に黙って捨てる relay が実在し、
 * `publish()` は OK かソケット死亡でしか settle しないため必要。
 */
export const PUBLISH_TIMEOUT_MS = 10_000;

/** publish は購読の記録に相乗りして接続を保つ。REQ は送らないので呼ばれない。 */
const PUBLISH_ONLY_HANDLERS: RelaySubscriptionHandlers = {
  onEvent: () => {},
  onEose: () => {},
  onClosed: () => {},
};

/** 予算超過のバウンスを `hard` (degraded 判定) に混ぜると、健全なリレーまで degraded になる。 */
export type ReconnectReason = "relay" | "budget";

/**
 * 予算・失敗の記録・学んだ枠を窓口に持たせないのは、猶予が切れて窓口が消えても
 * 失敗の履歴や学んだ枠は残したいから。窓口はプールに頼む。
 */
export type RelaySessionOptions = {
  url: RelayUrl;
  scheduler: Scheduler;
  random: () => number;
  connect: () => RelayConnection;
  makeRoom: () => boolean;
  failureCount: () => number;
  noteFailure: (reason: ReconnectReason) => void;
  clearFailures: () => void;
  onConnected: () => void;
  /** NIP-11 の `max_subscriptions`。渡さない窓口は、断られて学んだ枠だけを持つ。 */
  declaredLimit?: () => number | null | undefined;
  learnedLimit: () => number | undefined;
  learn: (limit: number) => void;
  onQueued: () => void;
  onClosed: () => void;
};

/** 1 本の `subscribe()` 呼び出しに対応する登録。 */
type Entry = {
  filters: RelayFilter[];
  handlers: RelaySubscriptionHandlers;
  subscription: RelaySubscription | null;
  once: boolean;
  /** publish 用の仮の記録も `done`。枠に数えるのは `sent` だけ。 */
  state: "queued" | "sent" | "closed" | "done";
  /** 待たせた回数を二重に数えないため。 */
  waited: boolean;
  /**
   * NOTICE で戻されて、枠が実際に空くまで送らない印。すぐ送り直すと、リレーの数え方と
   * 食い違うとき保存済みのイベントを往復ごとに受け直すことになる。
   */
  parked: boolean;
  refusals: number;
};

/** 接続が `null` でも、待つ人が居る間は窓口はこの URL を諦めず、再接続の対象として残る。 */
export class RelaySession {
  readonly #options: RelaySessionOptions;
  #connection: RelayConnection | null = null;
  readonly #entries = new Set<Entry>();
  #offClose: (() => void) | null = null;
  /** `connect()` が返っただけでは開いた証拠にならないので、失敗の記録を消すのはこの発火時だけ。 */
  #offOpen: (() => void) | null = null;
  /** 接続済み、または待つエントリが無い間は必ず `null`。残すと誰も待っていないリレーへ再接続し続ける。 */
  #timer: ReturnType<Scheduler["setTimeout"]> | null = null;
  /** `selectRelays` の `pinned` とは別物 —— こちらは予算チェックそのものを迂回する側。 */
  #reserved = false;
  /** `#entries` とは独立に数える。`#entries` が 0 になっても残っていれば接続は落とさない。 */
  #holds = 0;
  /** strfry は上限を超えた REQ にも EOSE を返したあとで NOTICE を返すので、NOTICE の対象はこれ。 */
  #lastEosed: Entry | null = null;
  /** `since` は予算が足りないとき、古い順に閉じるための記録。 */
  #linger: {
    timer: ReturnType<Scheduler["setTimeout"]>;
    since: number;
  } | null = null;
  #closed = false;

  constructor(options: RelaySessionOptions) {
    this.#options = options;
  }

  get url(): RelayUrl {
    return this.#options.url;
  }

  get hasConnection(): boolean {
    return this.#connection !== null;
  }

  get reserved(): boolean {
    return this.#reserved;
  }

  get inUse(): boolean {
    return this.#connection !== null && this.#linger === null;
  }

  get lingeringSince(): number | null {
    return this.#connection && this.#linger ? this.#linger.since : null;
  }

  /** 予算チェックとソケット生成を一本化しないと、片方だけ直されて迂回する経路が残る。 */
  ensureConnected(reserved: boolean): boolean {
    this.#cancelLinger();
    if (!this.#connection) {
      if (!reserved && !this.#options.makeRoom()) return false;
      try {
        this.#attachConnection(this.#options.connect());
      } catch {
        // `noteFailure` は呼び出し元の `#scheduleReconnect` が呼ぶ。ここでも呼ぶと二重に計上する。
      }
    }
    // 窓口ごと消えれば reserved も忘れる。同じ URL でも drop を挟めば `reservedSize` から外れる。
    if (reserved) this.#reserved = true;
    return true;
  }

  /** 失敗は例外にせず `handlers.onClosed` に変換する。呼び出し元を壊さないため。 */
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
      // 待っている間も呼び出し元から見れば開いている購読で、close() は待ち行列から外すだけ。
      this.#pump();
    } else {
      // connect() が失敗した場合。呼ばないと、一度も繋がったことのない
      // relay は #onConnectionDied を経由しないので再試行が一切積まれない。
      this.#scheduleReconnect();
      handlers.onClosed("relay unavailable");
    }

    return {
      close: () => {
        // 窓口ごと閉じた後や二重 close は何もしない。
        if (this.#closed || !this.#entries.has(entry)) return;
        this.#entries.delete(entry);
        entry.subscription?.close();
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
   * 購読にしないのは、一部のリレーが絶対にマッチしないフィルタの REQ を
   * `blocked` で CLOSE するから。
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
        // 二重 release() は bootstrap.ts の finally などで起こりうる。holds を負にしない。
        if (released) return;
        released = true;
        // 閉じた後に別の窓口が開き直されていても、その窓口の hold を奪わない。
        if (this.#closed) return;
        this.#holds -= 1;
        this.#releaseIfIdle();
      },
    };
  }

  /** タイムアウトは reject と同時に必ず release する。接続を返さない決着を作らない。 */
  publish(event: NostrEvent): Promise<void> {
    const connection = this.#connection;
    const { url, scheduler } = this.#options;
    if (!connection) {
      // publish は entry を足さないので、誰も待っていなければここで片付ける。
      // hold が生きていれば、そのタイマーが再接続できなくなるので消さない。
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
      this.#releaseIfIdle();
    };

    return new Promise<void>((resolve, reject) => {
      // タイムアウト後にソケットが死ぬなど、両方が発火することがある。
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
   * リレーは認証した鍵をソケットが閉じるまで覚えているので、アカウントを替えても
   * 同じソケットを使うと前のアカウントとして読み書きできてしまう。
   */
  resetAuthentication(): void {
    const connection = this.#connection;
    if (!connection?.authAttempted) return;
    // 猶予中は移す購読が無いので、張り直さず閉じて次に新しく開く。
    if (this.#linger) {
      this.close();
      return;
    }
    // 閉じずに捨てると、古いソケットの死が新しい接続へ移した購読に onClosed を配る。
    for (const entry of this.#entries) entry.subscription?.close();
    this.#requeueAll();
    this.#detachConnection();
    connection.close();
    this.#reconnect();
  }

  /** `reason` を渡さないと、待っていた一度きりの取得がタイムアウトまで待ち続ける。 */
  close(reason?: string): void {
    if (this.#closed) return;
    this.#closed = true;
    const entries = reason === undefined ? [] : [...this.#entries];
    // ソケットの死より先に外さないと、閉じたソケットからも onClosed が届いて二重に数えられる。
    for (const entry of entries) {
      entry.subscription?.close();
      entry.subscription = null;
    }
    // 残すと、閉じたはずのリレーへ再接続し続けるゾンビタイマーになる。
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

  /** 購読への `onClosed` は接続側が配り済みなので、ここで呼ぶと二重計上になる。 */
  #onConnectionDied(): void {
    if (this.#closed) return;
    this.#detachConnection();
    this.#requeueAll();
    // 猶予中に死んだ接続は再接続しない。残すと接続の無い記録が枠を食い続ける。
    if (this.#linger) {
      this.close();
      return;
    }
    this.#scheduleReconnect();
  }

  /** 接続が無い記録は猶予を置く理由が無いので、その場で片付ける。 */
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

  /** ジッタが無いと、同時に死んだ複数リレーの再接続が同期して復帰の瞬間にバーストする。 */
  #scheduleReconnect(reason: ReconnectReason = "relay"): void {
    if (this.#closed || this.#connection || this.#timer !== null) return;
    // hold だけの URL も再接続の対象。
    if (this.#entries.size === 0 && this.#holds === 0) return;

    // 順序を逆にすると、1 回目の遅延から既に 2 倍されてしまう。
    const count = this.#options.failureCount();
    const base = Math.min(RECONNECT_BASE_MS * 2 ** count, RECONNECT_MAX_MS);
    const delay = base * (0.5 + this.#options.random());
    this.#options.noteFailure(reason);
    this.#timer = this.#options.scheduler.setTimeout(() => {
      this.#timer = null;
      this.#reconnect();
    }, delay);
  }

  /** 最初の接続と再接続で別々に書くと、REQ が張り直されずソケットだけ生きてカラムが沈黙する。 */
  #attachConnection(connection: RelayConnection): void {
    if (this.#timer !== null) {
      this.#options.scheduler.clearTimeout(this.#timer);
      this.#timer = null;
    }
    // 通常は #onConnectionDied で解除済みだが、念のため先に外す。
    this.#offOpen?.();
    this.#connection = connection;
    const offClose = connection.onClose(() => this.#onConnectionDied());
    const offNotice = connection.onNotice?.((message) =>
      this.#onNotice(message),
    );
    this.#offClose = () => {
      offClose();
      offNotice?.();
    };
    this.#offOpen = connection.onOpen(() => this.#options.clearFailures());
    this.#options.onConnected();

    this.#pump();
  }

  #requeueAll(): void {
    this.#lastEosed = null;
    for (const entry of this.#entries) {
      entry.subscription = null;
      entry.waited = false;
      entry.parked = false;
      if (entry.state !== "done") entry.state = "queued";
    }
  }

  /** NIP-11 で枠なしと分かったリレーでも、断られて学んだ値があればそれが枠になる。 */
  #limit(): number | undefined {
    const learned = this.#options.learnedLimit();
    if (!this.#options.declaredLimit) return learned;
    const declared = this.#options.declaredLimit();
    if (declared === null) return learned;
    const base = declared ?? DEFAULT_MAX_SUBSCRIPTIONS;
    return learned === undefined ? base : Math.min(base, learned);
  }

  /** 流し続ける購読を先に通す。カラムが欠けるより、反応の数が少し遅れる方がよい。 */
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
      // 同期的に EOSE が届いた場合は subscription がまだ無く、ここでしか閉じられない。
      if (isDone(entry)) {
        entry.subscription.close();
        entry.subscription = null;
      }
    } catch {
      entry.subscription = null;
      entry.state = "closed";
      // 無防備に呼ぶと、1 つが投げただけで残りが REQ 無しのまま取り残される。
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
        // 呼び出し元が閉じるのを待たずに枠を返す。
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
    // ここで枠を空けると、死んだ接続へ待っている購読を送ってしまう。
    if (reason === SOCKET_CLOSED) {
      entry.handlers.onClosed(reason);
      return;
    }
    if (
      entry.state === "sent" &&
      isSubscriptionLimitMessage(reason) &&
      this.#refuse(entry)
    ) {
      // 呼び出し元には伝えない。欠けではなく、待たせるだけ。
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
   * strfry は上限を超えた REQ にも、保存済みのイベントと EOSE は返したあとで NOTICE を返し、
   * 断るのは流し続ける部分だけ。なので断られたのは直前に EOSE を受けた購読。一度きりの取得は
   * もう取れているので何もしない。
   *
   * 枠を学ぶのは NIP-11 に上限が無い（取れない）リレーだけ。バーストの最中はこちらの
   * `sent` の数がリレー側より多く、数えた値から学ぶと低く覚えすぎるので、既定値を下限にする。
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

  /** NOTICE で戻した購読は、枠が実際に空くまで送らない。すぐ送ると往復ごとに受け直す。 */
  #unpark(): void {
    for (const entry of this.#entries) entry.parked = false;
  }

  /**
   * 開いているのが 1 本だけなら上限のせいとは言えず、戻しても同じ断られ方を繰り返す
   * ので戻さない。戻すたびに枠は 1 つ減るので、繰り返しは枠が 1 になるまでで止まる。
   */
  #refuse(entry: Entry): boolean {
    const open = this.#openCount();
    if (open < 2) return false;
    this.#options.learn(open - 1);
    this.#requeue(entry);
    return true;
  }

  #requeue(entry: Entry): void {
    // 残すと、あとで届く古い REQ への応答がこの記録を動かす。
    entry.subscription?.close();
    entry.subscription = null;
    entry.state = "queued";
    entry.waited = false;
  }

  /** `since` で埋めず元のフィルタを張り直すのは、500 件上限を食いつぶさないため。 */
  #reconnect(): void {
    if (
      this.#closed ||
      this.#connection ||
      (this.#entries.size === 0 && this.#holds === 0)
    ) {
      return;
    }

    // 生きている接続からは奪わず、後で再試行する。reserved はここでは特別扱いしない —— 予約は
    // 最初の要求限りで、待てなければ `collect()` のタイムアウトが縮退させる。
    if (!this.#options.makeRoom()) {
      this.#scheduleReconnect("budget");
      return;
    }

    let connection: RelayConnection;
    try {
      connection = this.#options.connect();
    } catch {
      // `noteFailure` は直後の `#scheduleReconnect` が呼ぶ。ここでも呼ぶと二重に計上する。
      this.#scheduleReconnect();
      return;
    }

    this.#attachConnection(connection);
  }
}
