import type { RelayUrl } from "../relay/relay-connection";
import { parseContent } from "./content";
import { type NostrEvent, isNostrEvent } from "./event";

/** NIP-01 の id / pubkey は 32 バイトの小文字 hex 表現である。 */
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * 他のイベントへの参照。`q` タグは event-address（置換可能イベントの
 * `kind:pubkey:d` 座標）も運べるので、id 形式と区別できる形にする ——
 * 混ぜると `{ ids: [...] }` で座標を引きに行って永久に見つからない。
 */
export type EventRef =
  | { form: "id"; id: string; relay?: RelayUrl; pubkey?: string }
  | { form: "address"; address: string; relay?: RelayUrl };

type IdRef = Extract<EventRef, { form: "id" }>;

/**
 * 空文字を落とす。NIP-10 はリレー URL について「may be empty string」と
 * 明記しており、空文字をそのままリレーヒントとして下流へ渡すと接続先として
 * 使われうる。
 */
const relayOf = (value: string | undefined): RelayUrl | undefined =>
  value && value.length > 0 ? (value as RelayUrl) : undefined;

const pubkeyOf = (value: string | undefined): string | undefined =>
  value && HEX_64.test(value) ? value : undefined;

const idRef = (
  id: string,
  relay?: string,
  pubkey?: string,
): IdRef | undefined => {
  if (!HEX_64.test(id)) return undefined;
  const ref: IdRef = { form: "id", id };
  const r = relayOf(relay);
  if (r) ref.relay = r;
  const p = pubkeyOf(pubkey);
  if (p) ref.pubkey = p;
  return ref;
};

/**
 * 返信先（親）を返す。**marker が付いた `e` タグだけを見る。**
 *
 * NIP-10 の marker は `"reply"` と `"root"` の 2 つだけであり、`"mention"`
 * は現行仕様に存在しない（v0 の実装は割り当てているが、それは古い）。
 * marker 無しの位置ベースの旧形式は deprecated で、NIP-10 自身が
 * 「曖昧で解決不能」としているので解釈しない。
 *
 * `reply` があればそれ、無ければ `root` —— NIP-10 は「スレッドのルートへの
 * 直接の返信は root marker の `e` タグ 1 本だけを持つ」と定めているので、
 * `reply` だけを見ると最も普通の返信が親を持たないことになる。
 */
export const replyTarget = (event: NostrEvent): IdRef | undefined => {
  let root: IdRef | undefined;
  for (const tag of event.tags) {
    if (tag[0] !== "e") continue;
    const marker = tag[3];
    if (marker !== "reply" && marker !== "root") continue;
    const ref = idRef(tag[1] ?? "", tag[2], tag[4]);
    if (!ref) continue;
    if (marker === "reply") return ref;
    root ??= ref;
  }
  return root;
};

/**
 * 引用先を順に返す。**`e` タグは拾わない** —— NIP-18 が `q` タグを作った
 * 目的そのものが「引用がスレッドの返信として現れないようにする」ことなので、
 * 混ぜると逆流する。
 */
export const quoteTargets = (event: NostrEvent): EventRef[] => {
  const refs: EventRef[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== "q") continue;
    const value = tag[1] ?? "";
    if (value.includes(":")) {
      const ref: EventRef = { form: "address", address: value };
      const r = relayOf(tag[2]);
      if (r) ref.relay = r;
      refs.push(ref);
      continue;
    }
    const ref = idRef(value, tag[2], tag[3]);
    if (ref) refs.push(ref);
  }
  return refs;
};

/**
 * 本文の `nostr:note1…` / `nostr:nevent1…` が指すイベント。
 *
 * **`q` タグと重ならないものだけを返す。** 引用は `q` タグと本文の
 * `nostr:` の両方に現れるのが普通で、両方から描くと同じイベントが二重に
 * 出る。`q` タグ側を正とし、ここは「タグを付けずに本文へ貼っただけ」の
 * クライアントを拾うための補いに徹する。
 *
 * `naddr`（座標）は返さない —— 置換可能イベントを引く経路がまだ無く、
 * `q` タグの `address` 形と同じ理由で描けない。
 */
export const contentQuoteTargets = (event: NostrEvent): IdRef[] => {
  const tagged = new Set(
    quoteTargets(event).flatMap((ref) => (ref.form === "id" ? [ref.id] : [])),
  );
  const refs: IdRef[] = [];
  const seen = new Set<string>();
  for (const token of parseContent(event)) {
    if (token.type !== "mention") continue;
    const ref = token.ref;
    if (ref.kind !== "note" && ref.kind !== "nevent") continue;
    if (tagged.has(ref.id) || seen.has(ref.id)) continue;
    seen.add(ref.id);
    const relay = ref.kind === "nevent" ? relayOf(ref.relays[0]) : undefined;
    refs.push(
      relay ? { form: "id", id: ref.id, relay } : { form: "id", id: ref.id },
    );
  }
  return refs;
};

/**
 * リポスト対象の `e` タグ。**例外を投げない** —— NIP-18 は kind:6 に `e`
 * タグを要求するが、守らないイベントは実在しうる。1 件の不正なイベントで
 * カラム全体を壊さない（仕様 9 節）。
 */
export const repostTarget = (event: NostrEvent): IdRef | undefined => {
  for (const tag of event.tags) {
    if (tag[0] !== "e") continue;
    const ref = idRef(tag[1] ?? "", tag[2], tag[4]);
    if (ref) return ref;
  }
  return undefined;
};

/**
 * リポストの `content` に埋め込まれた対象イベント（NIP-18）。
 *
 * **この値は信用できない** —— リポストした人が書いた任意の文字列である。
 * ここで確かめるのは形（`isNostrEvent`）だけで、**署名の検証は呼び出し側が
 * `EventStore.put` を通して行う**。put が `"rejected"` を返したら、この
 * 埋め込みは捨てて `e` タグから引き直すこと。
 */
export const embeddedRepostEvent = (
  event: NostrEvent,
): NostrEvent | undefined => {
  // 空文字 (トリム後) を早期に弾く。**この早期リターンを消してもテストは
  // 1 つも落ちない** —— 空文字を JSON.parse に渡すと SyntaxError を投げ、
  // 下の try/catch がそのまま吸収して undefined を返すので、早期リターンの
  // 有無は外部から観測できない (deck.ts の loadDeck の `raw === null` と同じ
  // 構造)。それでも残すのは、「content が無い」という呼び出し側の意図を
  // JSON.parse の例外送出という偶然の挙動任せにせず、コードとして明示する
  // ため。
  if (event.content.trim().length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    return undefined;
  }
  return isNostrEvent(parsed) ? parsed : undefined;
};
