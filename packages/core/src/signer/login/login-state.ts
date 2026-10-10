/**
 * ログインしている人の署名器が使えるか。`connecting` と `disconnected` の間も
 * その人の画面を出しておき、書き込みだけを待たせる・断る。
 */
export type SignerStatus = "none" | "connecting" | "ready" | "disconnected";

export type LoginState = {
  pubkey?: string;
  status: SignerStatus;
  /** ログイン・復元の処理が走っている。重ねて始めない。 */
  pending: boolean;
  error?: string;
  /** 保存したログインを戻せなかったが、消してはいない。署名器が戻れば試し直せる。 */
  restoreFailed: boolean;
  /**
   * 繋がっていない間はリレーの認証を断っているので、戻ったら張り直して認証
   * させる必要がある。
   */
  authStale: boolean;
};

export type LoginEvent =
  | { type: "task-started" }
  | { type: "task-finished" }
  /** 覚えていた人の画面を先に出し、署名器が戻るまで署名を待たせる。 */
  | { type: "restore-started"; pubkey?: string }
  | { type: "connected"; pubkey: string }
  | { type: "restore-failed"; message: string }
  | { type: "failed"; message: string }
  | { type: "logged-out" };

export const initialLoginState = (): LoginState => ({
  status: "none",
  pending: false,
  restoreFailed: false,
  authStale: false,
});

export const reduceLogin = (
  state: LoginState,
  event: LoginEvent,
): LoginState => {
  switch (event.type) {
    case "task-started": {
      const { error: _error, ...rest } = state;
      return { ...rest, pending: true, restoreFailed: false };
    }
    case "task-finished":
      return { ...state, pending: false };
    case "restore-started": {
      const pubkey = event.pubkey ?? state.pubkey;
      return pubkey === undefined
        ? state
        : { ...state, pubkey, status: "connecting" };
    }
    case "connected": {
      const { error: _error, ...rest } = state;
      return {
        ...rest,
        pubkey: event.pubkey,
        status: "ready",
        restoreFailed: false,
        authStale: false,
      };
    }
    case "restore-failed":
      // 覚えていた人がいれば、その人の画面を読み取りだけで残す
      // （スマホでは署名器が一時的に止まっているだけのことが多い）。
      return state.pubkey === undefined
        ? {
            ...state,
            status: "none",
            error: event.message,
            restoreFailed: true,
          }
        : {
            ...state,
            status: "disconnected",
            error: event.message,
            restoreFailed: true,
            authStale: true,
          };
    case "failed":
      return { ...state, error: event.message };
    case "logged-out":
      return { ...initialLoginState(), pending: state.pending };
  }
};

/**
 * リレーは認証した鍵を接続が切れるまで覚えているので、署名器を替えたら
 * 張り直す。戻すのを待っていた同じ人の署名器なら、認証も戻るのを待っていた
 * ので張り直さない（ただし繋がらない間に認証を断っていたら張り直す）。
 */
export const needsAuthReset = (
  before: LoginState,
  pubkey: string | undefined,
): boolean =>
  !(before.status === "connecting" && before.pubkey === pubkey) ||
  before.authStale;
