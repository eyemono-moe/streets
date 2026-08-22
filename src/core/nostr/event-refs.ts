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
export const relayOf = (value: string | undefined): RelayUrl | undefined =>
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
 * スレッドの根を返す。**`root` マーカーの付いた `e` タグだけを見る。**
 *
 * `replyTarget` は `reply` があればそちらを優先するので、返信への返信では
 * 根が取れない。スレッドの購読は根に投げる（NIP-10 を守る返信は深さに
 * 関わらず全員が根を指すため）ので、根だけを返す経路が別に要る。
 *
 * 見つからなければ `undefined`。**自分の id を返さない** —— 呼び出し側が
 * 「このイベント自身が根である」ことを判定できなくなる。
 */
export const threadRoot = (event: NostrEvent): IdRef | undefined => {
  for (const tag of event.tags) {
    if (tag[0] !== "e" || tag[3] !== "root") continue;
    const ref = idRef(tag[1] ?? "", tag[2], tag[4]);
    if (ref) return ref;
  }
  return undefined;
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
 * `q` タグのうち、**本文に `nostr:` として現れないもの**。
 *
 * 本文に現れた引用はその位置に埋め込むので (`NoteContent` の `eventRefs`)、
 * ここで返すと同じイベントが 2 回描かれる。[NIP-18] は本文の言及を `q`
 * タグへ変換することを MUST としているが、[NIP-27] は `q` タグを任意と
 * しており、両者は食い違っている —— 本文とタグは両方向にずれうるので、
 * 「タグにしか無いもの」を最下部に出すことで、どちらのクライアントの
 * 投稿でも引用を落とさない。
 *
 * 座標形式 (`form: "address"`) も本文の `naddr` と突き合わせる —— `naddr`
 * は `eventKind`/`pubkey`/`identifier` を運び、`q` タグの座標形式
 * (`<kind>:<pubkey>:<identifier>`) と同じ 3 つ組なので、id 形式と同じ理由
 * (二重描画を避ける) で突き合わせられる。
 *
 * `q` タグ自身が同じ対象を 2 本重複して持つこともある —— 最下部の重複も
 * ここで一緒に落とす (id/address それぞれで先勝ち)。
 */
export const tagOnlyQuoteTargets = (event: NostrEvent): EventRef[] => {
  const mentionedIds = new Set<string>();
  const mentionedAddresses = new Set<string>();
  for (const token of parseContent(event.content, event.tags)) {
    if (token.type !== "mention") continue;
    const ref = token.ref;
    if (ref.kind === "note" || ref.kind === "nevent") {
      mentionedIds.add(ref.id);
    } else if (ref.kind === "naddr") {
      mentionedAddresses.add(
        `${ref.eventKind}:${ref.pubkey}:${ref.identifier}`,
      );
    }
  }

  const seenIds = new Set<string>();
  const seenAddresses = new Set<string>();
  const refs: EventRef[] = [];
  for (const ref of quoteTargets(event)) {
    if (ref.form === "id") {
      if (mentionedIds.has(ref.id) || seenIds.has(ref.id)) continue;
      seenIds.add(ref.id);
    } else {
      if (
        mentionedAddresses.has(ref.address) ||
        seenAddresses.has(ref.address)
      ) {
        continue;
      }
      seenAddresses.add(ref.address);
    }
    refs.push(ref);
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
