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

/** フォーム入力を対象種別に合わせて解釈し、秘密鍵形式は受け付けない。 */
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
  const decrypt = legacy ? signer.nip04?.decrypt : signer.nip44?.decrypt;
  if (!decrypt) return { status: "unavailable" };
  try {
    const plaintext = await decrypt(pubkey, event.content);
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
    privatePart: "ready",
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

/** kind:10000 全体を一度だけ更新し、未知の公開・非公開タグを保つ。 */
export const changeMuteList =
  (signer: Signer, pubkey: string, change: MuteChange): Replacement =>
  async (current) => {
    const publicTags = changeTags(current?.tags ?? [], change, "public");
    const touchesPrivate =
      change.entry.visibility === "private" ||
      (change.type === "move" && change.to === "private");
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
    const privateTags = changeTags(privateResult.tags, change, "private");
    const content = await signer.nip44.encrypt(
      pubkey,
      JSON.stringify(privateTags),
    );
    return { kind: MUTE_KIND, tags: publicTags, content };
  };

/** 1 件のイベントに一致する項目を、設定画面と同じ entry で返す。 */
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

/** メニューからの thread 対象は、返信なら根、根なら自分自身。 */
export const threadMuteTarget = (event: NostrEvent): MuteTarget => ({
  type: "thread",
  value: threadRoot(event)?.id ?? event.id,
});
