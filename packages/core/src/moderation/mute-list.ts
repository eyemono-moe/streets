import type { MuteTarget } from "../nostr/build/mute";
import type { NostrEvent } from "../nostr/event";
import { replyTarget, threadRoot } from "../nostr/event-refs";
import { decodeNip19, decodeNpub } from "../nostr/nip19";
import type { Signer } from "../signer/signer";
import type { Replacement } from "../write/writer";

export const MUTE_KIND = 10_000;

export type MuteVisibility = "private" | "public";
export type MuteEntry = {
  target: MuteTarget;
  visibility: MuteVisibility;
};

export type DecodedMuteList = {
  entries: readonly MuteEntry[];
  privatePart: "ready" | "unavailable" | "invalid";
};

export type MuteChange =
  | { type: "add"; entry: MuteEntry }
  | { type: "remove"; entry: MuteEntry }
  | { type: "move"; entry: MuteEntry; to: MuteVisibility };

export class PrivateMuteUnavailableError extends Error {
  constructor(message = "signer cannot access private mute items") {
    super(message);
    this.name = "PrivateMuteUnavailableError";
  }
}

export class InvalidPrivateMuteListError extends Error {
  constructor(message = "private mute items could not be decoded") {
    super(message);
    this.name = "InvalidPrivateMuteListError";
  }
}

const HEX64 = /^[0-9a-f]{64}$/;

const normalizedTarget = (target: MuteTarget): MuteTarget | undefined => {
  const value = target.value.trim();
  switch (target.type) {
    case "pubkey":
    case "thread":
      return HEX64.test(value) ? { ...target, value } : undefined;
    case "hashtag": {
      const hashtag = value.replace(/^#+/, "");
      return hashtag ? { ...target, value: hashtag } : undefined;
    }
    case "word":
      return value ? { ...target, value: value.toLowerCase() } : undefined;
  }
};

export const parseMuteTarget = (
  type: MuteTarget["type"],
  input: string,
): MuteTarget | undefined => {
  const value = input.trim().replace(/^nostr:/, "");
  if (type === "pubkey") {
    const direct = decodeNpub(value);
    if (direct) return { type, value: direct };
    const ref = decodeNip19(value);
    return ref?.kind === "nprofile"
      ? normalizedTarget({ type, value: ref.pubkey })
      : undefined;
  }
  if (type === "thread") {
    if (HEX64.test(value)) return { type, value };
    const ref = decodeNip19(value);
    return ref?.kind === "note" || ref?.kind === "nevent"
      ? normalizedTarget({ type, value: ref.id })
      : undefined;
  }
  return normalizedTarget({ type, value });
};

const tagOf = (target: MuteTarget): string[] => {
  switch (target.type) {
    case "pubkey":
      return ["p", target.value];
    case "thread":
      return ["e", target.value];
    case "hashtag":
      return ["t", target.value];
    case "word":
      return ["word", target.value.toLowerCase()];
  }
};

const targetOf = (tag: readonly string[]): MuteTarget | undefined => {
  const value = tag[1];
  if (!value) return undefined;
  switch (tag[0]) {
    case "p":
      return normalizedTarget({ type: "pubkey", value });
    case "e":
      return normalizedTarget({ type: "thread", value });
    case "t":
      return normalizedTarget({ type: "hashtag", value });
    case "word":
      return normalizedTarget({ type: "word", value });
    default:
      return undefined;
  }
};

const sameTarget = (left: MuteTarget, right: MuteTarget): boolean =>
  left.type === right.type && left.value === right.value;

const parsePrivateTags = (plaintext: string): string[][] | undefined => {
  try {
    const value: unknown = JSON.parse(plaintext);
    return Array.isArray(value) &&
      value.every(
        (tag) =>
          Array.isArray(tag) && tag.every((item) => typeof item === "string"),
      )
      ? (value as string[][])
      : undefined;
  } catch {
    return undefined;
  }
};

const decryptPrivateTags = async (
  event: NostrEvent,
  signer: Signer,
  pubkey: string,
): Promise<
  { status: "ready"; tags: string[][] } | { status: "unavailable" | "invalid" }
> => {
  if (event.content === "") return { status: "ready", tags: [] };
  const legacy = event.content.includes("?iv=");
  const cipher = legacy ? signer.nip04 : signer.nip44;
  if (!cipher) return { status: "unavailable" };
  try {
    const plaintext = await cipher.decrypt(pubkey, event.content);
    const tags = parsePrivateTags(plaintext);
    return tags ? { status: "ready", tags } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
};

export const decodeMuteList = async (
  event: NostrEvent | undefined,
  signer: Signer,
  pubkey: string,
): Promise<DecodedMuteList> => {
  // リストがまだ無くても、非公開部を新規作成できるかは署名器の能力で
  // 決まる。「空なので復号できた」と「NIP-44 を使える」を混同しない。
  if (!event) {
    return {
      entries: [],
      privatePart: signer.nip44 ? "ready" : "unavailable",
    };
  }
  const publicEntries = event.tags.flatMap((tag) => {
    const target = targetOf(tag);
    return target ? [{ target, visibility: "public" as const }] : [];
  });
  const privateResult = await decryptPrivateTags(event, signer, pubkey);
  if (privateResult.status !== "ready") {
    return { entries: publicEntries, privatePart: privateResult.status };
  }
  const privateEntries = privateResult.tags.flatMap((tag) => {
    const target = targetOf(tag);
    return target ? [{ target, visibility: "private" as const }] : [];
  });
  return {
    entries: [...publicEntries, ...privateEntries],
    // NIP-04 で旧項目を読めても、新しく書くには NIP-44 が要る。content が
    // 空の場合も同じで、「復号するものが無い」と「編集できる」は別である。
    privatePart: signer.nip44 ? "ready" : "unavailable",
  };
};

const changeTags = (
  tags: readonly string[][],
  change: MuteChange,
  visibility: MuteVisibility,
): string[][] => {
  const appliesTo =
    change.entry.visibility === visibility ||
    (change.type === "move" && change.to === visibility);
  if (!appliesTo) return tags.map((tag) => [...tag]);

  const remove =
    change.type === "remove" ||
    (change.type === "move" && change.entry.visibility === visibility);
  if (remove) {
    return tags
      .filter((tag) => {
        const target = targetOf(tag);
        return !target || !sameTarget(target, change.entry.target);
      })
      .map((tag) => [...tag]);
  }

  const target = normalizedTarget(change.entry.target);
  if (!target) return tags.map((tag) => [...tag]);
  if (
    tags.some((tag) => {
      const existing = targetOf(tag);
      return existing ? sameTarget(existing, target) : false;
    })
  ) {
    return tags.map((tag) => [...tag]);
  }
  return [...tags.map((tag) => [...tag]), tagOf(target)];
};

/**
 * いくつもの変更を 1 つの版にまとめて当てる。非公開部の復号と暗号化は 1 回ずつ
 * にする —— 拡張機能の署名器は復号・暗号化のたびに確認を出すことがある。
 */
export const changeMuteListMany =
  (
    signer: Signer,
    pubkey: string,
    changes: readonly MuteChange[],
  ): Replacement =>
  async (current) => {
    const publicTags = changes.reduce<string[][]>(
      (tags, change) => changeTags(tags, change, "public"),
      (current?.tags ?? []).map((tag) => [...tag]),
    );
    const touchesPrivate = changes.some(
      (change) =>
        change.entry.visibility === "private" ||
        (change.type === "move" && change.to === "private"),
    );
    if (!touchesPrivate) {
      return {
        kind: MUTE_KIND,
        tags: publicTags,
        content: current?.content ?? "",
      };
    }

    if (!signer.nip44) throw new PrivateMuteUnavailableError();
    const privateResult = current
      ? await decryptPrivateTags(current, signer, pubkey)
      : { status: "ready" as const, tags: [] };
    if (privateResult.status !== "ready") {
      if (privateResult.status === "unavailable") {
        throw new PrivateMuteUnavailableError();
      }
      throw new InvalidPrivateMuteListError();
    }
    const privateTags = changes.reduce<string[][]>(
      (tags, change) => changeTags(tags, change, "private"),
      privateResult.tags,
    );
    const content = await signer.nip44.encrypt(
      pubkey,
      JSON.stringify(privateTags),
    );
    return { kind: MUTE_KIND, tags: publicTags, content };
  };

export const changeMuteList = (
  signer: Signer,
  pubkey: string,
  change: MuteChange,
): Replacement => changeMuteListMany(signer, pubkey, [change]);

const sameEntry = (left: MuteEntry, right: MuteEntry): boolean =>
  left.visibility === right.visibility && sameTarget(left.target, right.target);

/**
 * 保存を待たずに画面へ出すため、読み取った項目へ変更を当てる。保存のときに
 * タグへ当てる `changeTags` と同じ規則（同じ公開範囲に同じ対象は 1 つ）に従う。
 */
export const applyMuteChanges = (
  entries: readonly MuteEntry[],
  changes: readonly MuteChange[],
): MuteEntry[] => {
  let current = [...entries];
  for (const change of changes) {
    const target = normalizedTarget(change.entry.target);
    if (!target) continue;
    const entry = { ...change.entry, target };
    switch (change.type) {
      case "add":
        if (!current.some((existing) => sameEntry(existing, entry))) {
          current.push(entry);
        }
        break;
      case "remove":
        current = current.filter((existing) => !sameEntry(existing, entry));
        break;
      case "move": {
        const moved = { target, visibility: change.to };
        current = current.filter(
          (existing) =>
            !sameEntry(existing, entry) && !sameEntry(existing, moved),
        );
        current.push(moved);
        break;
      }
    }
  }
  return current;
};

export const matchingMutes = (
  entries: readonly MuteEntry[],
  event: NostrEvent,
): MuteEntry[] => {
  const roots = new Set([
    event.id,
    threadRoot(event)?.id,
    replyTarget(event)?.id,
  ]);
  const hashtags = new Set(
    event.tags.filter((tag) => tag[0] === "t").map((tag) => tag[1]),
  );
  const content = event.content.toLowerCase();
  return entries.filter(({ target }) => {
    switch (target.type) {
      case "pubkey":
        return event.pubkey === target.value;
      case "thread":
        return roots.has(target.value);
      case "hashtag":
        return hashtags.has(target.value);
      case "word":
        return content.includes(target.value.toLowerCase());
    }
  });
};

export const threadMuteTarget = (event: NostrEvent): MuteTarget => ({
  type: "thread",
  value: threadRoot(event)?.id ?? event.id,
});
