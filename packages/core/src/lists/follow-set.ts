import type { NostrEvent } from "../nostr/event";
import {
  type ItemVisibility,
  type PrivatePartStatus,
  decryptPrivateTags,
  rewritePrivateTags,
} from "../nostr/private-tags";
import type { Signer } from "../signer/signer";
import type { Replacement } from "../write/writer";

/** NIP-51 のフォローセット。画面では「リスト」と呼ぶ。 */
export const FOLLOW_SET_KIND = 30_000;

export type FollowSetMember = { pubkey: string; visibility: ItemVisibility };

export type FollowSet = {
  pubkey: string;
  /** `d` タグ。持ち主の中でリストを見分ける。 */
  identifier: string;
  title: string | undefined;
  description: string | undefined;
  /** リストの画像（`image` タグ）の URL。 */
  image: string | undefined;
  members: FollowSetMember[];
  /**
   * 非公開のメンバーを読めたか。持ち主以外が読んだとき（公開の部分だけ）は
   * `undefined`。
   */
  privatePart: PrivatePartStatus | undefined;
};

export type FollowSetChange =
  | { type: "add"; member: FollowSetMember }
  | { type: "remove"; member: FollowSetMember }
  | { type: "describe"; title: string; description: string; image: string };

const HEX64 = /^[0-9a-f]{64}$/;

const identifierOf = (event: NostrEvent): string =>
  event.tags.find((tag) => tag[0] === "d")?.[1] ?? "";

const tagValue = (event: NostrEvent, name: string): string | undefined => {
  const value = event.tags.find((tag) => tag[0] === name)?.[1]?.trim();
  return value ? value : undefined;
};

/** 同じ人が同じ公開範囲に 2 回入っていても 1 人に数える。 */
const membersOf = (
  tags: readonly string[][],
  visibility: ItemVisibility,
): FollowSetMember[] => {
  const seen = new Set<string>();
  return tags.flatMap((tag) => {
    const pubkey = tag[1];
    if (tag[0] !== "p" || !pubkey || !HEX64.test(pubkey) || seen.has(pubkey)) {
      return [];
    }
    seen.add(pubkey);
    return [{ pubkey, visibility }];
  });
};

/** 公開の部分だけを読む。ほかの人のリストや、復号を待つ間に使う。 */
export const readFollowSet = (event: NostrEvent): FollowSet => ({
  pubkey: event.pubkey,
  identifier: identifierOf(event),
  title: tagValue(event, "title"),
  description: tagValue(event, "description"),
  image: tagValue(event, "image"),
  members: membersOf(event.tags, "public"),
  privatePart: undefined,
});

/** 自分のリストを、非公開のメンバーまで読む。 */
export const decodeFollowSet = async (
  event: NostrEvent,
  signer: Signer,
  viewer: string,
): Promise<FollowSet> => {
  const set = readFollowSet(event);
  if (event.pubkey !== viewer) return set;
  const result = await decryptPrivateTags(event, signer, viewer);
  if (result.status !== "ready") return { ...set, privatePart: result.status };
  const publicKeys = new Set(set.members.map((member) => member.pubkey));
  return {
    ...set,
    // 公開と非公開の両方に入っている人は、公開として 1 人に数える。
    members: [
      ...set.members,
      ...membersOf(result.tags, "private").filter(
        (member) => !publicKeys.has(member.pubkey),
      ),
    ],
    // 旧い NIP-04 の暗号文は読めても、書くには NIP-44 が要る。
    privatePart: signer.nip44 ? "ready" : "unavailable",
  };
};

/** 題名が無いリストは `d` で呼ぶ（ほかのクライアントもそうしている）。 */
export const followSetName = (set: Pick<FollowSet, "title" | "identifier">) =>
  set.title ?? (set.identifier || "名前のないリスト");

/**
 * 一部のクライアントは、`d` が `mute` のリストをミュートの指定として扱う
 * （NIP-51 で kind:10000 に移ったが、古い形が残っている）。
 */
export const mayBeLegacyMuteSet = (set: Pick<FollowSet, "identifier">) =>
  set.identifier === "mute";

/**
 * 1 人分の、リストごとの最新版。ストアには古い版も残るので、`d` ごとに
 * 新しいものだけを取る。並びは名前順 —— 更新順にすると、人を足すたびに並びが変わる。
 */
export const latestFollowSets = (
  events: readonly NostrEvent[],
): NostrEvent[] => {
  const latest = new Map<string, NostrEvent>();
  for (const event of events) {
    if (event.kind !== FOLLOW_SET_KIND) continue;
    const key = `${event.pubkey}:${identifierOf(event)}`;
    const current = latest.get(key);
    if (
      !current ||
      event.created_at > current.created_at ||
      (event.created_at === current.created_at && event.id < current.id)
    ) {
      latest.set(key, event);
    }
  }
  return [...latest.values()].sort((left, right) =>
    followSetName(readFollowSet(left)).localeCompare(
      followSetName(readFollowSet(right)),
      "ja",
    ),
  );
};

/**
 * ほかの人のリストのうち、その人が公開で入っているもの。自分のリストは除く
 * （作ったリストとして別に並べる）。`d` が `mute` のものも除く —— 古い形の
 * ミュートの指定で、「入っているリスト」として見せるものではない。
 */
export const followSetsIncluding = (
  events: readonly NostrEvent[],
  pubkey: string,
): FollowSet[] =>
  latestFollowSets(events)
    .filter((event) => event.pubkey !== pubkey)
    .map(readFollowSet)
    .filter(
      (set) =>
        !mayBeLegacyMuteSet(set) &&
        set.members.some((member) => member.pubkey === pubkey),
    );

/** 新しいリストの `d`。名前から作らない —— 名前は後から変えられる。 */
export const newFollowSetIdentifier = (): string =>
  crypto.randomUUID().replaceAll("-", "").slice(0, 16);

const withMember = (tags: readonly string[][], pubkey: string): string[][] =>
  tags.some((tag) => tag[0] === "p" && tag[1] === pubkey)
    ? tags.map((tag) => [...tag])
    : // NIP-51: 足した順に並ぶよう末尾へ足す。
      [...tags.map((tag) => [...tag]), ["p", pubkey]];

const withoutMember = (tags: readonly string[][], pubkey: string): string[][] =>
  tags
    .filter((tag) => !(tag[0] === "p" && tag[1] === pubkey))
    .map((tag) => [...tag]);

/** 名前・説明・画像を差し替える。空の説明と画像はタグごと外す。 */
const describeTags = (
  tags: readonly string[][],
  change: Extract<FollowSetChange, { type: "describe" }>,
): string[][] => {
  const described = new Set(["title", "description", "image"]);
  const others = tags
    .filter((tag) => !described.has(tag[0] ?? ""))
    .map((tag) => [...tag]);
  const description = change.description.trim();
  const image = change.image.trim();
  return [
    ["title", change.title.trim()],
    ...(description ? [["description", description]] : []),
    ...(image ? [["image", image]] : []),
    ...others,
  ];
};

const applyToTags = (
  tags: readonly string[][],
  change: FollowSetChange,
  visibility: ItemVisibility,
): string[][] => {
  switch (change.type) {
    case "describe":
      // 名前と説明は公開の部分にだけ置く（NIP-51 は非公開の題名を定めていない）。
      return visibility === "public"
        ? describeTags(tags, change)
        : tags.map((tag) => [...tag]);
    case "add":
      return change.member.visibility === visibility &&
        HEX64.test(change.member.pubkey)
        ? withMember(tags, change.member.pubkey)
        : tags.map((tag) => [...tag]);
    case "remove":
      return change.member.visibility === visibility
        ? withoutMember(tags, change.member.pubkey)
        : tags.map((tag) => [...tag]);
  }
};

/**
 * 変更を 1 つの版にまとめて当てる。非公開に触れる変更があるときだけ復号と
 * 暗号化をする —— 拡張機能の署名器は、そのたびに確認を出すことがある。
 * `d` は `Writer.replace` が付ける。
 */
export const changeFollowSet =
  (
    signer: Signer,
    viewer: string,
    changes: readonly FollowSetChange[],
  ): Replacement =>
  async (current) => {
    const tags = changes.reduce<string[][]>(
      (next, change) => applyToTags(next, change, "public"),
      (current?.tags ?? []).map((tag) => [...tag]),
    );
    const touchesPrivate = changes.some(
      (change) =>
        change.type !== "describe" && change.member.visibility === "private",
    );
    if (!touchesPrivate) {
      return {
        kind: FOLLOW_SET_KIND,
        tags,
        content: current?.content ?? "",
      };
    }
    const content = await rewritePrivateTags(current, signer, viewer, (tags) =>
      changes.reduce<string[][]>(
        (next, change) => applyToTags(next, change, "private"),
        tags,
      ),
    );
    return { kind: FOLLOW_SET_KIND, tags, content };
  };

/** 保存を待たずに画面へ出すため、読み取ったリストへ変更を当てる。 */
export const applyFollowSetChanges = (
  set: FollowSet,
  changes: readonly FollowSetChange[],
): FollowSet =>
  changes.reduce<FollowSet>((current, change) => {
    switch (change.type) {
      case "describe": {
        return {
          ...current,
          title: change.title.trim() || undefined,
          description: change.description.trim() || undefined,
          image: change.image.trim() || undefined,
        };
      }
      case "add":
        // 読むときと同じく、1 人は 1 回だけ数える。
        return current.members.some(
          (member) => member.pubkey === change.member.pubkey,
        )
          ? current
          : { ...current, members: [...current.members, change.member] };
      case "remove":
        return {
          ...current,
          members: current.members.filter(
            (member) =>
              member.pubkey !== change.member.pubkey ||
              member.visibility !== change.member.visibility,
          ),
        };
    }
  }, set);

/** まだ 1 つも版が無いリスト（作った直後、届く前）。 */
export const emptyFollowSet = (
  pubkey: string,
  identifier: string,
): FollowSet => ({
  pubkey,
  identifier,
  title: undefined,
  description: undefined,
  image: undefined,
  members: [],
  privatePart: undefined,
});
