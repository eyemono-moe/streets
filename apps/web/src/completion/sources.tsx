import { encodeBech32, encodeNprofile } from "@streets/core/nostr/nip19";
import { type Profile, parseProfile } from "@streets/core/nostr/profile";
import {
  type CompletionTrigger,
  EMOJI_TRIGGER,
  USER_TRIGGER,
  rankUsers,
} from "@streets/core/view/completion";
import { searchEmojis } from "@streets/core/view/emoji-search";
import { Show, createMemo, createSignal, onCleanup } from "solid-js";
import { useEventActions } from "../actions";
import { useEmojiGroups } from "../emoji/custom-emojis";
import { ProfileName } from "../note/Name";
import { useOptionalReadLayer } from "../read-layer";
import Avatar from "../ui/Avatar";
import type { CompletionItem, CompletionSource } from "../ui/Completion";

/** 一度に出す候補の数。これより多いと、選ぶより打ち足すほうが速い。 */
const LIMIT = 20;
/** nprofile に添えるリレーの数。多いと本文が長くなる。 */
const RELAY_HINTS = 2;
/**
 * プロフィールを一度に要求する人数。フォロー中の人を全員まとめて頼むと、
 * 1 本のフィルタが大きすぎてリレーに断られる。
 */
const PROFILE_CHUNK = 100;
const PROFILE_CHUNK_MS = 300;

export type UserEntry = {
  pubkey: string;
  profile: Profile | undefined;
  tags: readonly string[][];
};

/**
 * 人の候補の 1 行。名前の横の `@name` は、表示名と別にあるときだけ出す（同じ文字を
 * 2 度並べない）。幅が足りなければ、名前を残して `@name` から切る。
 */
export const UserRow = (props: { user: UserEntry }) => {
  const handle = () =>
    props.user.profile?.displayName && props.user.profile.name
      ? `@${props.user.profile.name}`
      : undefined;
  return (
    <>
      <Avatar
        pubkey={props.user.pubkey}
        picture={props.user.profile?.picture}
        class="size-6 rounded-full"
      />
      <span class="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span class="min-w-0 truncate font-600 text-body">
          <ProfileName
            pubkey={props.user.pubkey}
            profile={props.user.profile}
            tags={props.user.tags}
          />
        </span>
        <Show when={handle()}>
          {(text) => (
            <span class="c-secondary min-w-0 shrink-[4] truncate text-caption">
              {text()}
            </span>
          )}
        </Show>
      </span>
    </>
  );
};

/** 人の候補を集めたもの。入れ方の違う欄（`from:` と `@` など）で使い回す。 */
export type UserCandidates = {
  /** 打った言葉に合う人を、近い順に。 */
  find: (query: string) => { pubkey: string; user: UserEntry }[];
  /** その人を指す nprofile。書き込みリレーを添える。 */
  nprofile: (pubkey: string) => string;
};

/**
 * 人の候補を集める。先に出す人（返信先など）→ フォロー中の人の順。読み取り層が
 * 無い場所（Storybook の一部など）では誰も出さない。
 */
export const useUserCandidates = (
  first?: () => readonly string[],
): UserCandidates => {
  const readLayer = useOptionalReadLayer();
  const actions = useEventActions();
  const npubOf = (pubkey: string) => encodeBech32("npub", pubkey);
  if (!readLayer) return { find: () => [], nprofile: npubOf };
  const { store, profiles, routing } = readLayer;

  // プロフィールが届くたびに候補を作り直す。
  const [version, setVersion] = createSignal(0);
  onCleanup(
    store.onReplaceableChanged((change) => {
      if (change.kind === 0) setVersion((value) => value + 1);
    }),
  );

  const people = () => {
    const seen = new Set<string>();
    const ranked: { pubkey: string; rank: number }[] = [];
    const add = (pubkeys: readonly string[], rank: number) => {
      for (const pubkey of pubkeys) {
        if (seen.has(pubkey) || pubkey === actions?.viewer) continue;
        seen.add(pubkey);
        ranked.push({ pubkey, rank });
      }
    };
    add(first?.() ?? [], 0);
    add(actions?.followeeIds() ?? [], 1);
    return ranked;
  };

  // 候補を初めて出したときに、プロフィールの無い人を少しずつ取りに行く。
  const asked = new Set<string>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  onCleanup(() => timers.forEach(clearTimeout));
  const requestMissing = (pubkeys: readonly string[]) => {
    const missing = pubkeys.filter(
      (pubkey) =>
        !asked.has(pubkey) && store.latestReplaceable(0, pubkey) === undefined,
    );
    for (const pubkey of missing) asked.add(pubkey);
    for (let i = 0; i < missing.length; i += PROFILE_CHUNK) {
      const chunk = missing.slice(i, i + PROFILE_CHUNK);
      timers.push(
        setTimeout(
          () => {
            for (const pubkey of chunk) profiles.request(pubkey);
          },
          (i / PROFILE_CHUNK) * PROFILE_CHUNK_MS,
        ),
      );
    }
  };

  const entries = createMemo(() => {
    version();
    return people().map(({ pubkey, rank }) => {
      const latest = store.latestReplaceable(0, pubkey);
      const profile = latest ? parseProfile(latest.content) : undefined;
      return {
        pubkey,
        rank,
        user: { pubkey, profile, tags: latest?.tags ?? [] },
        names: [profile?.displayName, profile?.name],
        ids: [npubOf(pubkey)],
      };
    });
  });

  return {
    find: (query) => {
      const all = entries();
      requestMissing(all.map((entry) => entry.pubkey));
      return rankUsers(all, query).slice(0, LIMIT);
    },
    nprofile: (pubkey) => {
      const relays =
        routing?.writeRelaysFor(pubkey).slice(0, RELAY_HINTS) ?? [];
      return encodeNprofile({ pubkey, relays }) ?? npubOf(pubkey);
    },
  };
};

/** 人の候補を、欄に合った入れ方で出す。 */
export const userSource = (
  candidates: UserCandidates,
  options: {
    trigger?: CompletionTrigger;
    /** 入れる文字。本文なら `nostr:${nprofile}`、検索なら `nprofile` のまま。 */
    format: (nprofile: string) => string;
    /** 後ろに空白を置くか。 */
    space?: boolean;
  },
): CompletionSource => ({
  trigger: options.trigger ?? USER_TRIGGER,
  items: (query) =>
    candidates.find(query).map(
      (entry): CompletionItem => ({
        key: entry.pubkey,
        // 選んだ時点のリレーを添える（一覧を出した後に届いた分も入る）。
        get insert() {
          return options.format(candidates.nprofile(entry.pubkey));
        },
        space: options.space,
        view: () => <UserRow user={entry.user} />,
      }),
    ),
});

/** スタンプの候補の 1 行。入っているセットの名前を添える（同じ名前が別のセットにもあるため）。 */
export const EmojiRow = (props: {
  shortcode: string;
  url: string;
  set: string;
}) => (
  <>
    <img
      src={props.url}
      alt=""
      loading="lazy"
      class="size-6 shrink-0 object-contain"
    />
    <span class="min-w-0 flex-1 truncate text-body">:{props.shortcode}:</span>
    <span class="c-secondary min-w-0 max-w-[40%] truncate text-caption">
      {props.set}
    </span>
  </>
);

/** スタンプの候補（`:` で出す）。自分の絵文字から、名前で絞る。 */
export const useEmojiSource = (): CompletionSource => {
  const groups = useEmojiGroups();
  const emojis = createMemo(() => {
    const seen = new Set<string>();
    const all: { shortcode: string; url: string; set: string }[] = [];
    for (const group of groups()) {
      for (const emoji of group.emojis) {
        if (emoji.kind !== "custom" || seen.has(emoji.shortcode)) continue;
        seen.add(emoji.shortcode);
        all.push({
          shortcode: emoji.shortcode,
          url: emoji.url,
          set: group.title,
        });
      }
    }
    return all;
  });

  return {
    trigger: EMOJI_TRIGGER,
    items: (query) =>
      searchEmojis(
        emojis().map((emoji) => ({ ...emoji, shortcodes: [emoji.shortcode] })),
        query,
      )
        .slice(0, LIMIT)
        .map(
          (emoji): CompletionItem => ({
            key: emoji.shortcode,
            insert: `:${emoji.shortcode}:`,
            view: () => <EmojiRow {...emoji} />,
          }),
        ),
  };
};

/**
 * 本文（ノート・返信・引用）の補完。人は `nostr:nprofile…` として入れ、後ろに
 * 空白を置く（NIP-27）。
 */
export const useNoteSources = (
  first?: () => readonly string[],
): CompletionSource[] => [
  userSource(useUserCandidates(first), {
    format: (nprofile) => `nostr:${nprofile}`,
    space: true,
  }),
  useEmojiSource(),
];
