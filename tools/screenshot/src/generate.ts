import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  buildColumn,
  buildUserColumn,
} from "@streets/core/deck/column-presets";
import {
  type ColumnDef,
  DECK_EVENT_IDENTIFIER,
  saveDeck,
} from "@streets/core/deck/deck";
import type { BlobDescriptor } from "@streets/core/media/blossom";
import type { EventDraft } from "@streets/core/nostr/build/draft";
import { addFollow } from "@streets/core/nostr/build/follow";
import { withMedia } from "@streets/core/nostr/build/media";
import {
  buildNote,
  buildQuote,
  buildReply,
} from "@streets/core/nostr/build/note";
import { mergeProfile } from "@streets/core/nostr/build/profile";
import { buildReaction } from "@streets/core/nostr/build/reaction";
import { withReferences } from "@streets/core/nostr/build/references";
import { setRelayList } from "@streets/core/nostr/build/relay-list";
import { buildRepost } from "@streets/core/nostr/build/repost";
import { type NostrEvent, computeEventId } from "@streets/core/nostr/event";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import { setSearchRelays } from "@streets/core/settings/search-relay-list";
import {
  conversationKey,
  encryptNip44,
} from "@streets/core/signer/nip46/nip44";
import type { AssetName, DeckColumn, Scenario, UserProfile } from "./define";
import { pubkeyFor, secretKeyFor } from "./keys";
import { resolveTime } from "./time";
import { type UserId, users } from "./users";

/** Zap の受領に署名する、架空のウォレットのサーバー。 */
const ZAP_WALLET = "zap-wallet";

/** プロフィールやフォローなど、投稿より前からあるものの時刻。 */
const SETUP_AGE_SECONDS = 30 * 86_400;

export type GenerateOptions = {
  /** 基準時刻（UNIX 秒）。`ago` はここから数える。 */
  base: number;
  /** 投入するリレー。各ユーザーのリレー一覧（kind:10002）とヒントに入れる。 */
  relayUrl: string;
  /** 画像を配る URL と、その中身から読んだ値。 */
  asset: (name: AssetName) => BlobDescriptor;
};

/** 署名する。auxRand を 0 に固定し、同じ入力なら同じ sig になるようにする。 */
const sign = (signer: string, draft: EventDraft, createdAt: number) => {
  const unsigned = {
    ...draft,
    pubkey: pubkeyFor(signer),
    created_at: createdAt,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(
      schnorr.sign(hexToBytes(id), secretKeyFor(signer), new Uint8Array(32)),
    ),
  } satisfies NostrEvent;
};

/** 下書きを、置換可能イベントの差分関数へ渡せる形にする（中身だけ使われる）。 */
const asCurrent = (draft: EventDraft | undefined): NostrEvent | undefined =>
  draft && { ...draft, id: "", pubkey: "", sig: "", created_at: 0 };

/** 本文の `{@kai}` を、その人を指す `nostr:npub…` にする。 */
const expandMentions = (content: string): string =>
  content.replace(/\{@(\w+)\}/g, (whole, id: string) =>
    id in users ? `nostr:${encodeBech32("npub", pubkeyFor(id))}` : whole,
  );

const deckColumn = (
  column: DeckColumn<UserId>,
  index: number,
): ColumnDef | undefined => {
  if (column.kind === "user") return buildUserColumn(pubkeyFor(column.user));
  const built = buildColumn(
    column.kind,
    column.kind === "search" ? column.query : "",
  );
  // 作り直すたびに id が変わると、デッキのイベントの id も変わってしまう。
  return built && { ...built, id: `screenshot-${index}-${column.kind}` };
};

/**
 * シナリオを署名済みのイベントにする。同じシナリオと基準時刻なら、毎回同じ
 * イベント（同じ id）になる。返す順は古い順。
 */
export const generate = (
  scenario: Scenario<UserId>,
  options: GenerateOptions,
): NostrEvent[] => {
  const setupAt = options.base - SETUP_AGE_SECONDS;
  const events: NostrEvent[] = [];
  const posts = new Map<string, NostrEvent>();
  const need = (id: string, from: string) => {
    const event = posts.get(id);
    if (!event) {
      throw new Error(
        `「${from}」が指す投稿「${id}」がありません（指される投稿は、指す側より前の時刻にしてください）`,
      );
    }
    return event;
  };

  for (const [id, profile] of Object.entries(users) as [
    UserId,
    UserProfile,
  ][]) {
    const { picture, banner, website } = profile;
    events.push(
      sign(
        id,
        mergeProfile({
          name: profile.name,
          display_name: profile.displayName,
          about: profile.about,
          ...(picture ? { picture: options.asset(picture).url } : {}),
          ...(banner ? { banner: options.asset(banner).url } : {}),
          ...(website ? { website } : {}),
        })(undefined),
        setupAt,
      ),
      // 読む先・書く先をこのリレーに寄せる。Streets は人ごとに書き込みリレーを読みに行く。
      sign(
        id,
        setRelayList([{ url: options.relayUrl, read: true, write: true }])(
          undefined,
        ),
        setupAt,
      ),
      // 検索カラムもこのリレーへ聞く。無いと、外の既定の検索リレーへ問い合わせてしまう。
      sign(id, setSearchRelays([options.relayUrl])(undefined), setupAt),
    );
  }

  for (const [id, followees] of Object.entries(scenario.follows) as [
    UserId,
    readonly UserId[],
  ][]) {
    let draft: EventDraft | undefined;
    for (const followee of followees) {
      draft = addFollow(pubkeyFor(followee), { relay: options.relayUrl })(
        asCurrent(draft),
      );
    }
    if (draft) events.push(sign(id, draft, setupAt));
  }

  // 返信や引用は相手の id を含むので、古いものから組み立てる。
  const ordered = [...scenario.posts]
    .map((post, index) => ({
      post,
      index,
      at: resolveTime(options.base, post),
    }))
    .sort((a, b) => a.at - b.at || a.index - b.index);
  for (const { post, at } of ordered) {
    const label = post.id ?? post.content.slice(0, 12);
    const content = expandMentions(post.content);
    const hint = { relayHint: options.relayUrl };
    let draft = post.replyTo
      ? buildReply(need(post.replyTo, label), content, hint)
      : post.quote
        ? buildQuote(need(post.quote, label), content, hint)
        : buildNote(content);
    draft = withReferences(draft, {});
    draft = withMedia(draft, (post.images ?? []).map(options.asset));
    const event = sign(post.author, draft, at);
    events.push(event);
    if (post.id) {
      if (posts.has(post.id))
        throw new Error(`投稿の id が重なっています: ${post.id}`);
      posts.set(post.id, event);
    }
  }

  for (const reaction of scenario.reactions ?? []) {
    const target = need(reaction.to, `${reaction.author} のリアクション`);
    events.push(
      sign(
        reaction.author,
        buildReaction(
          target,
          reaction.emoji
            ? { type: "text", content: reaction.emoji }
            : { type: "like" },
          { relayHint: options.relayUrl },
        ),
        resolveTime(options.base, reaction),
      ),
    );
  }

  for (const repost of scenario.reposts ?? []) {
    const target = need(repost.of, `${repost.author} のリポスト`);
    const draft = buildRepost(target, { relayHint: options.relayUrl });
    if (!draft) throw new Error(`リポストできない投稿です: ${repost.of}`);
    events.push(sign(repost.author, draft, resolveTime(options.base, repost)));
  }

  for (const zap of scenario.zaps ?? []) {
    const target = need(zap.to, `${zap.from} の Zap`);
    const at = resolveTime(options.base, zap);
    const msat = zap.sats * 1000;
    // 送る人の依頼（kind:9734）を、ウォレットの受領（kind:9735）の description に入れる（NIP-57）。
    const request = sign(
      zap.from,
      {
        kind: 9734,
        tags: [
          ["p", target.pubkey],
          ["e", target.id],
          ["amount", String(msat)],
          ["relays", options.relayUrl],
        ],
        content: zap.message ?? "",
      },
      at - 1,
    );
    events.push(
      sign(
        ZAP_WALLET,
        {
          kind: 9735,
          tags: [
            ["p", target.pubkey],
            ["P", request.pubkey],
            ["e", target.id],
            // 金額だけが読まれる。1n は 100 msat。
            ["bolt11", `lnbc${msat / 100}n1pscreenshot`],
            ["description", JSON.stringify(request)],
          ],
          content: "",
        },
        at,
      ),
    );
  }

  if (scenario.deck) {
    const columns = scenario.deck
      .map(deckColumn)
      .filter((column): column is ColumnDef => column !== undefined);
    const viewer = scenario.viewer;
    // デッキは自分宛ての NIP-44 で暗号化して置く（Streets の同期と同じ形）。nonce も固定する。
    const content = encryptNip44(
      saveDeck({ version: 2, columns }),
      conversationKey(secretKeyFor(viewer), pubkeyFor(viewer)),
      sha256(utf8ToBytes(`streets-screenshot/deck/${viewer}`)),
    );
    events.push(
      sign(
        viewer,
        { kind: 30078, tags: [["d", DECK_EVENT_IDENTIFIER]], content },
        setupAt,
      ),
    );
  }

  return events.sort((a, b) => a.created_at - b.created_at);
};
