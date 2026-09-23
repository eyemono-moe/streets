import type { Mutation } from "../nostr/build/draft";
import { setRelayList } from "../nostr/build/relay-list";
import { type RelayListEntry, parseRelayList } from "../read/relay-list";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

/** リレーの一覧に対する 1 回の操作。 */
export type RelayOp =
  /** `usage` を省くと両方に使う。 */
  | { type: "add"; url: RelayUrl; usage?: RelayUsage }
  | { type: "remove"; url: RelayUrl }
  | { type: "set-usage"; url: RelayUrl; read: boolean; write: boolean };

/**
 * リレーの使い方。読み込み・書き込みを別々に入り切りさせると「どちらもしない」が
 * 作れてしまうので、3 つから選ばせる。
 */
export type RelayUsage = "both" | "read" | "write";

export const usageOf = (entry: RelayListEntry): RelayUsage =>
  entry.read && entry.write ? "both" : entry.read ? "read" : "write";

export const usageOp = (url: RelayUrl, usage: RelayUsage): RelayOp => ({
  type: "set-usage",
  url,
  read: usage !== "write",
  write: usage !== "read",
});

const applyOne = (current: RelayListEntry[], op: RelayOp): RelayListEntry[] => {
  switch (op.type) {
    case "add":
      return current.some((entry) => entry.url === op.url)
        ? current
        : [
            ...current,
            {
              url: op.url,
              read: op.usage !== "write",
              write: op.usage !== "read",
            },
          ];
    case "remove":
      return current.filter((entry) => entry.url !== op.url);
    case "set-usage":
      return current.map((entry) =>
        entry.url === op.url
          ? { ...entry, read: op.read, write: op.write }
          : entry,
      );
  }
};

const count = (entries: readonly RelayListEntry[]) => ({
  read: entries.filter((entry) => entry.read).length,
  write: entries.filter((entry) => entry.write).length,
});

/**
 * その操作を当ててよいか。読み込み・書き込みに使うリレーが 1 本でもあったなら、
 * 0 本にはしない —— 書き込みが無いと自分の投稿がどこにも残らず、読み込みが
 * 無いとタイムラインが空になる。読み込みも書き込みもしないリレーは NIP-65 に
 * 書けない（書くと「両方」と読まれる）ので、両方を切る操作も通さない。
 */
export const allowsRelayOp = (
  entries: readonly RelayListEntry[],
  op: RelayOp,
): boolean => {
  if (op.type === "set-usage" && !op.read && !op.write) return false;
  const before = count(entries);
  const after = count(applyOne([...entries], op));
  return (
    (before.read === 0 || after.read > 0) &&
    (before.write === 0 || after.write > 0)
  );
};

/** 操作を順に当てる。当ててはいけない操作は飛ばす。 */
export const applyRelayOps = (
  entries: readonly RelayListEntry[],
  ops: readonly RelayOp[],
): RelayListEntry[] =>
  ops.reduce<RelayListEntry[]>(
    (current, op) =>
      allowsRelayOp(current, op) ? applyOne(current, op) : current,
    [...entries],
  );

/**
 * 操作を、保存の直前に取り直した最新の kind:10002 へ当てる。一覧を丸ごと
 * 書き戻すと、別の端末で足したリレーを消してしまう。
 */
export const relayOpsMutation =
  (ops: readonly RelayOp[]): Mutation =>
  (current) =>
    setRelayList(applyRelayOps(current ? parseRelayList(current) : [], ops))(
      current,
    );

/**
 * 設定の画面での書きかけ。`pending` はまだ送っていない操作、`saving` は送って
 * いる途中の操作。画面には保存済みの一覧へ両方を当てたものを出す。
 */
export type RelayEditState = {
  pending: RelayOp[];
  saving: RelayOp[];
};

export type RelayEditEvent =
  | { type: "relays/edit"; op: RelayOp }
  /** 待ちが明けた。書きかけを送る。 */
  | { type: "relays/flush" }
  | { type: "relays/saved" }
  | { type: "relays/failed" };

/** 呼ぶたびに新しく作る。受け取った側が書き換えても他へ漏れないようにする。 */
export const emptyRelayEdit = (): RelayEditState => ({
  pending: [],
  saving: [],
});

export const relayEditTransition = (
  state: RelayEditState,
  event: RelayEditEvent,
): RelayEditState => {
  switch (event.type) {
    case "relays/edit":
      return { ...state, pending: [...state.pending, event.op] };
    case "relays/flush":
      // 送っている途中に重ねて送ると、同じ最新から作った 2 つの版が競う。
      // 前のが済むまで待たせる。
      if (state.saving.length > 0 || state.pending.length === 0) return state;
      // 配列は作り直して渡す。store の reconcile は元の配列を書き換えるので、
      // `pending` と同じ配列を `saving` に置くと、空にした `pending` と一緒に消える。
      return { pending: [], saving: [...state.pending] };
    case "relays/saved":
      // 保存した版は store に入っているので、画面はそこから作り直せる。
      return state.saving.length === 0 ? state : { ...state, saving: [] };
    case "relays/failed":
      // 送れなかった操作は捨てる（画面は保存済みの一覧に戻る）。失敗はトーストで知らせる。
      return state.saving.length === 0 ? state : { ...state, saving: [] };
  }
};

/** 画面に出す一覧。 */
export const displayedRelays = (
  saved: readonly RelayListEntry[],
  state: RelayEditState,
): RelayListEntry[] =>
  applyRelayOps(saved, [...state.saving, ...state.pending]);

export type RelayInputResult =
  | { ok: true; url: RelayUrl }
  | { ok: false; message: string };

/**
 * 入力された URL を確かめる。`wss://` を省いて打つ人が多いので、スキームが
 * 無ければ補う。
 */
export const parseRelayInput = (
  input: string,
  existing: readonly RelayListEntry[],
): RelayInputResult => {
  const text = input.trim();
  if (text === "" || text === "wss://") {
    return { ok: false, message: "リレーの URL を入力してください" };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : `wss://${text}`;
  const url = normalizeRelayUrl(withScheme);
  if (!url) {
    return {
      ok: false,
      message: "wss:// で始まるリレーの URL を入力してください",
    };
  }
  if (existing.some((entry) => entry.url === url)) {
    return { ok: false, message: "このリレーはもう入っています" };
  }
  return { ok: true, url };
};

/** 画面に出す URL。正規化で付く末尾の `/` は見せない。 */
export const relayLabel = (url: RelayUrl): string => url.replace(/\/$/, "");
