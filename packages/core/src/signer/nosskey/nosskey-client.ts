import * as v from "valibot";

/**
 * nosskey.app を iframe で埋め込み、postMessage で署名を頼む。鍵は nosskey.app の
 * 側にあり、Streets には来ない。nosskey-iframe を使わないのは、Nostr の部分を
 * 自前で書く決まり（ADR-0020）に合わせ、iframe の置き場所と開閉を画面に合わせるため。
 */
export const NOSSKEY_IFRAME_URL = "https://nosskey.app/#/iframe";

/** 同意の画面で人が考える間も待つ。 */
export const NOSSKEY_REQUEST_TIMEOUT_MS = 120_000;

export type NosskeyMethod =
  | "getPublicKey"
  | "signEvent"
  | "nip44_encrypt"
  | "nip44_decrypt"
  | "nip04_decrypt";

export type NosskeyParams = {
  event?: unknown;
  pubkey?: string;
  plaintext?: string;
  ciphertext?: string;
};

const readySchema = v.object({ type: v.literal("nosskey:ready") });
const visibilitySchema = v.object({
  type: v.literal("nosskey:visibility"),
  visible: v.boolean(),
});
const responseSchema = v.object({
  type: v.literal("nosskey:response"),
  id: v.pipe(v.string(), v.minLength(1)),
  result: v.optional(v.unknown()),
  error: v.optional(v.object({ code: v.string(), message: v.string() })),
});

/** nosskey.app が断った・答えられなかった。`code` は `NO_KEY`・`USER_REJECTED` など。 */
export class NosskeyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NosskeyError";
  }
}

/** iframe とのやりとりに要るものだけ。DOM を直に触らないので、テストで差し替えられる。 */
export type NosskeyFrame = {
  /** iframe の window へ送る。まだ読み込まれていなければ false。 */
  post(message: unknown, targetOrigin: string): boolean;
  /** iframe から届いたものだけを渡す（`event.source` が iframe の window）。 */
  listen(handler: (data: unknown, origin: string) => void): () => void;
  /** 同意や保存領域の許可を求める間だけ、iframe を見せる。 */
  setVisible(visible: boolean): void;
};

export type NosskeyClient = {
  ready: Promise<void>;
  request(method: NosskeyMethod, params?: NosskeyParams): Promise<unknown>;
  close(): void;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export const createNosskeyClient = (options: {
  frame: NosskeyFrame;
  iframeUrl?: string;
  timeoutMs?: number;
  createId?: () => string;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}): NosskeyClient => {
  const origin = new URL(options.iframeUrl ?? NOSSKEY_IFRAME_URL).origin;
  const timeoutMs = options.timeoutMs ?? NOSSKEY_REQUEST_TIMEOUT_MS;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const createId = options.createId ?? (() => crypto.randomUUID());
  const pending = new Map<string, Pending>();
  let closed = false;
  let markReady: () => void = () => {};
  let failReady: (error: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    markReady = resolve;
    failReady = reject;
  });
  ready.catch(() => {});

  const unlisten = options.frame.listen((data, from) => {
    // 別のオリジンが iframe の中へ遷移させられていたら、その返事は信じない。
    if (from !== origin) return;
    if (v.is(readySchema, data)) {
      markReady();
      return;
    }
    if (v.is(visibilitySchema, data)) {
      options.frame.setVisible(data.visible);
      return;
    }
    if (!v.is(responseSchema, data)) return;
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    clearTimer(request.timer);
    if (data.error) {
      request.reject(new NosskeyError(data.error.code, data.error.message));
    } else {
      request.resolve(data.result);
    }
  });

  return {
    ready,
    request(method, params) {
      if (closed) {
        return Promise.reject(new NosskeyError("CLOSED", "client is closed"));
      }
      const id = createId();
      return new Promise((resolve, reject) => {
        const timer = setTimer(() => {
          pending.delete(id);
          reject(new NosskeyError("TIMEOUT", "nosskey did not answer in time"));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        const sent = options.frame.post(
          {
            type: "nosskey:request",
            id,
            method,
            ...(params ? { params } : {}),
          },
          origin,
        );
        if (!sent) {
          pending.delete(id);
          clearTimer(timer);
          reject(new NosskeyError("NOT_READY", "nosskey iframe is not loaded"));
        }
      });
    },
    close() {
      if (closed) return;
      closed = true;
      unlisten();
      failReady(new NosskeyError("CLOSED", "client is closed"));
      for (const [id, request] of pending) {
        clearTimer(request.timer);
        request.reject(new NosskeyError("CLOSED", "client is closed"));
        pending.delete(id);
      }
    },
  };
};
