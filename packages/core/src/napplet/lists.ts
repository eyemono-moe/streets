/*
 * NAP-LISTS（napplet/naps PR #68）。アップレットが、NIP-51 のリストと NIP-65 のリレーの
 * 一覧に項目を足す・外す。いまの版を読み、関係ないタグと暗号化した中身（content）を
 * そのまま残して書き直すのは Streets がする。
 *
 * 渡すのは、Streets が自分でも書いているリストだけ。非公開の項目は扱わない（いまある
 * 非公開の項目は content のまま残す）。
 */
import type { EventDraft } from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";
import { decodeNpub } from "../nostr/nip19";
import { normalizeRelayUrl } from "../relay/relay-url";

export type ListItemType =
  | "pubkey"
  | "event"
  | "address"
  | "hashtag"
  | "word"
  | "relay"
  | "server";

type ListEntry = {
  kind: number;
  /** NIP-51 の表の name から作る名前（NIP-65 は relay-list-metadata）。 */
  type: string;
  /** 画面に出す呼び名。 */
  label: string;
  addressable: boolean;
  /** 受け付ける項目と、書くタグの名前。 */
  items: Partial<Record<ListItemType, string>>;
};

/**
 * > `type` is derived from the NIP-51 table name: lowercase, punctuation and whitespace
 * > collapsed to hyphens, trimmed.
 * > NIP-65 relay list metadata is kind `10002` and type `relay-list-metadata`.
 */
const LISTS: readonly ListEntry[] = [
  {
    kind: 10000,
    type: "mute-list",
    label: "ミュート",
    addressable: false,
    items: { pubkey: "p", hashtag: "t", word: "word", event: "e" },
  },
  {
    kind: 10001,
    type: "pinned-notes",
    label: "ピン留め",
    addressable: false,
    items: { event: "e" },
  },
  {
    kind: 10002,
    type: "relay-list-metadata",
    label: "リレーの設定",
    addressable: false,
    items: { relay: "r" },
  },
  {
    kind: 10003,
    type: "bookmarks",
    label: "ブックマーク",
    addressable: false,
    items: { event: "e", address: "a" },
  },
  {
    kind: 10005,
    type: "public-chats",
    label: "お気に入りのチャンネル",
    addressable: false,
    items: { event: "e" },
  },
  {
    kind: 10006,
    type: "blocked-relays",
    label: "繋がないリレー",
    addressable: false,
    items: { relay: "relay" },
  },
  {
    kind: 10007,
    type: "search-relays",
    label: "検索するリレー",
    addressable: false,
    items: { relay: "relay" },
  },
  {
    kind: 10063,
    type: "blossom-servers",
    label: "画像のアップロード先",
    addressable: false,
    items: { server: "server" },
  },
  {
    kind: 30000,
    type: "follow-sets",
    label: "リスト",
    addressable: true,
    items: { pubkey: "p" },
  },
];

export type ListSupport = {
  kind: number;
  type: string;
  addressable: boolean;
  supportedItemTypes: string[];
  privateItems: boolean;
};

export const supportedLists = (): ListSupport[] =>
  LISTS.map((entry) => ({
    kind: entry.kind,
    type: entry.type,
    addressable: entry.addressable,
    supportedItemTypes: Object.keys(entry.items),
    privateItems: false,
  }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const HEX_64 = /^[0-9a-f]{64}$/;

export type ListRequest = {
  entry: { kind: number; type: string; label: string };
  identifier?: string;
  /** 書くタグ。NIP-65 の印は 3 番目に入る。 */
  tags: string[][];
  create: boolean;
  title?: string;
};

type Refusal = { ok: false; error: string; supported?: ListSupport[] };

const tagOf = (
  entry: ListEntry,
  raw: unknown,
  operation: "add" | "remove",
): string[] | undefined => {
  if (!isRecord(raw) || typeof raw.value !== "string") return undefined;
  // > For `add`, omitted `visibility` means `"public"`.
  if (raw.visibility === "private") return undefined;
  const itemType = raw.itemType as ListItemType;
  const name = entry.items[itemType];
  if (!name) return undefined;
  const value = raw.value.trim();
  switch (itemType) {
    case "pubkey": {
      const pubkey = decodeNpub(value);
      return pubkey ? [name, pubkey] : undefined;
    }
    case "event":
      return HEX_64.test(value) ? [name, value] : undefined;
    case "address":
      return /^\d+:[0-9a-f]{64}:.*$/.test(value) ? [name, value] : undefined;
    case "hashtag": {
      const hashtag = value.replace(/^#/, "").toLowerCase();
      return hashtag && !/\s/.test(hashtag) ? [name, hashtag] : undefined;
    }
    case "word":
      // NIP-51: `"word"` (lowercase string)
      return value ? [name, value.toLowerCase()] : undefined;
    case "relay": {
      const relay = normalizeRelayUrl(value);
      if (!relay) return undefined;
      if (entry.kind !== 10002) return [name, relay];
      // NAP-LISTS: `marker: "read"` writes `["r", url, "read"]`, `marker: "write"` writes
      // `["r", url, "write"]`, and omitted or `"read-write"` writes `["r", url]`.
      const marker = raw.marker;
      if (marker === "read" || marker === "write") return [name, relay, marker];
      if (marker === undefined || marker === "read-write") return [name, relay];
      return operation === "add" ? undefined : [name, relay];
    }
    case "server": {
      try {
        const url = new URL(value);
        return url.protocol === "https:" ? [name, url.origin] : undefined;
      } catch {
        return undefined;
      }
    }
  }
};

/** 頼まれたリストと項目を確かめ、書くタグにする。 */
export const parseListRequest = (
  list: unknown,
  items: unknown,
  options: unknown,
  operation: "add" | "remove",
): { ok: true; request: ListRequest } | Refusal => {
  if (!isRecord(list)) return { ok: false, error: "invalid-list-ref" };
  // > Exactly one of `ListRef.kind` or `ListRef.type` MUST be present.
  if ((list.kind === undefined) === (list.type === undefined)) {
    return { ok: false, error: "invalid-list-ref" };
  }
  const entry = LISTS.find((item) =>
    list.kind !== undefined ? item.kind === list.kind : item.type === list.type,
  );
  if (!entry) {
    return {
      ok: false,
      error: "unsupported-list",
      supported: supportedLists(),
    };
  }
  const identifier =
    typeof list.identifier === "string" && list.identifier !== ""
      ? list.identifier
      : undefined;
  // > MUST reject addressable sets without `identifier`.
  if (entry.addressable && !identifier) {
    return { ok: false, error: "missing-identifier" };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "invalid-item" };
  }
  if (items.some((item) => isRecord(item) && item.visibility === "private")) {
    return { ok: false, error: "private-items-unsupported" };
  }
  const tags: string[][] = [];
  for (const item of items) {
    const tag = tagOf(entry, item, operation);
    if (!tag) {
      return {
        ok: false,
        error:
          isRecord(item) && !entry.items[item.itemType as ListItemType]
            ? "unsupported-item"
            : "invalid-item",
      };
    }
    tags.push(tag);
  }
  const opts = isRecord(options) ? options : {};
  return {
    ok: true,
    request: {
      entry: { kind: entry.kind, type: entry.type, label: entry.label },
      ...(identifier ? { identifier } : {}),
      tags,
      create: opts.create === true,
      ...(typeof opts.title === "string" ? { title: opts.title } : {}),
    },
  };
};

const same = (a: readonly string[], b: readonly string[]) =>
  a[0] === b[0] && a[1] === b[1];

/**
 * いまの版に項目を足した・外した下書き。関係ないタグと content（非公開の項目）は残す。
 * 足すときは後ろに足し、同じものは足さない。
 *
 * > MUST append added items after existing items.
 * > MUST deduplicate exact item matches.
 * > For NIP-65, removing `marker: "read"` from an unmarked relay tag rewrites it to `"write"`;
 * > removing `"write"` rewrites it to `"read"`. Removing omitted or `"read-write"` removes all
 * > matching relay URL tags.
 */
export const applyListMutation = (
  current: NostrEvent | undefined,
  request: ListRequest,
  operation: "add" | "remove",
): { draft: EventDraft; changed: number; skipped: number } => {
  let tags = current ? current.tags.map((tag) => [...tag]) : [];
  if (!current && request.identifier) {
    tags = [
      ["d", request.identifier],
      ...(request.title ? [["title", request.title]] : []),
    ];
  }
  let changed = 0;
  let skipped = 0;
  for (const tag of request.tags) {
    if (operation === "add") {
      const existing = tags.find((item) => same(item, tag));
      // 印の無いもの（読み書きの両方）には、どの印を足しても変わらない。
      if (existing && (existing[2] === undefined || existing[2] === tag[2])) {
        skipped += 1;
        continue;
      }
      if (existing) {
        // NIP-65 で印だけが違うとき。読み書きの両方になるなら印を外す。
        const both = existing[2] !== undefined && tag[2] !== undefined;
        existing.splice(2, existing.length, ...(both ? [] : tag.slice(2)));
      } else {
        tags.push(tag);
      }
      changed += 1;
      continue;
    }
    const before = tags.length;
    const marker = tag[2];
    if (request.entry.kind === 10002 && marker) {
      const existing = tags.find((item) => same(item, tag));
      if (!existing) {
        skipped += 1;
        continue;
      }
      if (existing[2] === undefined) {
        existing[2] = marker === "read" ? "write" : "read";
      } else if (existing[2] === marker) {
        tags = tags.filter((item) => item !== existing);
      } else {
        skipped += 1;
        continue;
      }
      changed += 1;
      continue;
    }
    tags = tags.filter((item) => !same(item, tag));
    if (tags.length === before) skipped += 1;
    else changed += 1;
  }
  return {
    draft: { kind: request.entry.kind, tags, content: current?.content ?? "" },
    changed,
    skipped,
  };
};
