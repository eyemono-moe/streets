import type { OlderPage } from "./older-page";

/**
 * 新しい投稿の取り足し：`waiting` は最初のページを待っている、`idle` は取れる、
 * `loading` は取っている、`caught-up` は今に追いついた、`failed` はどのリレーも返事を
 * しなかった（もう一度取れる）。
 */
export type NewerPaging =
  | "waiting"
  | "idle"
  | "loading"
  | "caught-up"
  | "failed";

/** 窓をこれより狭くはしない。1 秒に 1 ページぶん以上ある区間は、そのまま受け取る。 */
const MIN_WINDOW = 1;
/** 一覧から密度を見積もれないときの窓。 */
const FALLBACK_WINDOW = 60 * 60;

export type NewerRequest = {
  since: number;
  until: number;
  limit: number;
  /** 取りに行ったときの今。`until` がここまで来ていれば、取り切ると追いつく。 */
  now: number;
};

export type NextNewer =
  /** `ceiling` までを一覧に入れてよい。次は `window` 秒ぶん取る。 */
  | { paging: "idle"; ceiling: number; window: number }
  | { paging: "caught-up"; ceiling: number }
  | { paging: "failed" };

/**
 * 一覧の今の密度から、1 ページぶんが入りそうな窓の幅を見積もる。`span` は一覧の
 * 新しい端と古い端の差（秒）、`count` はその件数。
 */
export const estimateWindow = (
  span: number,
  count: number,
  limit: number,
): number =>
  count < 2 || span <= 0
    ? FALLBACK_WINDOW
    : Math.max(MIN_WINDOW, Math.floor((span * limit) / count));

/**
 * 次の上限（一覧に入れてよい最新の時刻）を、リレーごとの返事から決める。
 *
 * リレーは窓の中を新しい順に `limit` 件まで返すので、`limit` いっぱいに返したリレーは
 * 窓の古い側を返していないかもしれない。そこを飛ばして新しい側を入れると、読み進める
 * ちょうどその場所に穴が開く。`limit` いっぱいに返したリレーが無いときだけ窓を
 * 取り切ったとみなし、あれば上限は動かさず、窓を狭めて取り直す。返事をしない
 * （時間切れ・CLOSED の）リレーは飛ばすが、1 本も EOSE を返さなければ失敗にする。
 */
export const nextNewer = (
  page: OlderPage,
  request: NewerRequest,
): NextNewer => {
  const { relays } = page;
  // 返事をしないリレーは飛ばして進む（古い方への取り足しと同じ扱い）。Outbox で
  // 何本にも送ると 1 本くらいは返事をせず、待つと進めなくなる。
  if (!relays.some((relay) => relay.reason === "eose")) {
    return { paging: "failed" };
  }
  const width = request.until - request.since;
  const overflowed = relays.some((relay) => relay.received >= request.limit);
  if (overflowed && width > MIN_WINDOW) {
    return {
      paging: "idle",
      ceiling: request.since,
      window: Math.max(MIN_WINDOW, Math.floor(width / 4)),
    };
  }
  if (request.until >= request.now) {
    return { paging: "caught-up", ceiling: request.until };
  }
  const received = Math.max(...relays.map((relay) => relay.received));
  // まばらな区間では窓を広げる。狭いまま進むと、空の窓を何度も取りに行く。
  const window =
    received * 2 < request.limit ? Math.max(width, MIN_WINDOW) * 2 : width;
  return { paging: "idle", ceiling: request.until, window };
};
