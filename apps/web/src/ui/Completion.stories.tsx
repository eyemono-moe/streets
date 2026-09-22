import { encodeBech32 } from "@streets/core/nostr/nip19";
import {
  EMOJI_TRIGGER,
  USER_TRIGGER,
  rankUsers,
} from "@streets/core/view/completion";
import { searchEmojis } from "@streets/core/view/emoji-search";
import { createSignal, onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EmojiRow, type UserEntry, UserRow } from "../completion/sources";
import avatarUrl from "../storybook/avatar-fixture.svg";
import emojiUrl from "../storybook/emoji-fixture.svg";
import Completion, { type CompletionSource } from "./Completion";
import { textInputClass } from "./TextField";

const user = (
  seed: string,
  profile?: UserEntry["profile"],
): UserEntry & { npub: string } => {
  const pubkey = seed.repeat(64).slice(0, 64);
  return {
    pubkey,
    npub: encodeBech32("npub", pubkey),
    profile,
    tags: [],
  };
};

const users = [
  user("a", { displayName: "えいも", name: "eyemono", picture: avatarUrl }),
  user("b", { displayName: "Alice", name: "alice" }),
  user("c", {
    displayName:
      "とても長い表示名を付けている人の名前がどこまでも続いていくときの見え方",
    name: "a_very_long_user_name_that_goes_on_and_on",
  }),
  // プロフィールがまだ届いていない人。npub の頭で出す。
  user("d"),
  user("e", { name: "no_display_name" }),
  ...["f", "1", "2", "3", "4", "5", "6"].map((seed, index) =>
    user(seed, { displayName: `フォロー中の人 ${index + 1}` }),
  ),
];

const emojis = [
  { shortcode: "neko", url: emojiUrl, set: "自分の絵文字" },
  { shortcode: "nekomimi", url: emojiUrl, set: "ねこセット" },
  {
    shortcode: "neko_with_a_very_long_shortcode_name",
    url: emojiUrl,
    set: "とても長い名前の絵文字セットがどこまでも続く",
  },
  // 読めない画像。
  {
    shortcode: "nekobroken",
    url: "https://example.invalid/x.png",
    set: "壊れた画像",
  },
];

const userSource: CompletionSource = {
  trigger: USER_TRIGGER,
  items: (query) =>
    rankUsers(
      users.map((entry) => ({
        ...entry,
        rank: 1,
        names: [entry.profile?.displayName, entry.profile?.name],
        ids: [entry.npub],
      })),
      query,
    ).map((entry) => ({
      key: entry.pubkey,
      insert: `nostr:${entry.npub}`,
      space: true,
      view: () => <UserRow user={entry} />,
    })),
};

const emojiSource: CompletionSource = {
  trigger: EMOJI_TRIGGER,
  items: (query) =>
    searchEmojis(
      emojis.map((emoji) => ({ ...emoji, shortcodes: [emoji.shortcode] })),
      query,
    ).map((emoji) => ({
      key: emoji.shortcode,
      insert: `:${emoji.shortcode}:`,
      view: () => <EmojiRow {...emoji} />,
    })),
};

/** 欄全体で人を探す（検索の「書いた人」など）。選ぶと欄が nprofile だけになる。 */
const wholeSource: CompletionSource = {
  ...userSource,
  trigger: { kind: "user", prefixes: [] },
  items: (query) =>
    userSource.items(query).map((item) => ({
      ...item,
      insert: item.insert.replace(/^nostr:/, ""),
      space: false,
    })),
};

type Args = {
  initial: string;
  multiline: boolean;
  emojiOnly?: boolean;
  whole?: boolean;
  width: string;
};

/**
 * 打つと候補が出る。`@` で人、`:` の後に英数字でスタンプ。開いた状態を
 * 見せるため、最初から欄にカーソルを置いておく。
 */
const Story = (props: Args) => {
  const [value, setValue] = createSignal(props.initial);
  let field: HTMLInputElement | HTMLTextAreaElement | undefined;
  onMount(() => {
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
    field.dispatchEvent(new Event("input"));
  });
  const sources = props.whole
    ? [wholeSource]
    : props.emojiOnly
      ? [emojiSource]
      : [userSource, emojiSource];
  return (
    <div class="flex flex-col gap-2 p-4" style={{ width: props.width }}>
      <Completion sources={sources} label="入れる候補">
        {(attach) =>
          props.multiline ? (
            <textarea
              ref={(el) => {
                field = el;
                attach(el);
              }}
              rows={4}
              class="c-primary rounded-2 border border-primary bg-secondary p-2.5 text-body outline-none"
              value={value()}
              onInput={(event) => setValue(event.currentTarget.value)}
            />
          ) : (
            <input
              ref={(el) => {
                field = el;
                attach(el);
              }}
              class={textInputClass}
              value={value()}
              onInput={(event) => setValue(event.currentTarget.value)}
            />
          )
        }
      </Completion>
      <pre class="c-secondary whitespace-pre-wrap break-all text-caption">
        {value()}
      </pre>
    </div>
  );
};

const meta = {
  title: "UI/Completion",
  component: Story,
  args: { initial: "こんにちは @", multiline: true, width: "360px" },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 人: S = {};
export const 人を名前で絞る: S = { args: { initial: "こんにちは @えい" } };
export const 当たる人がいない: S = { args: { initial: "@zzz" } };
export const スタンプ: S = { args: { initial: "かわいい:ne" } };
export const スタンプだけの1行の欄: S = {
  args: { initial: "えいも:ne", multiline: false, emojiOnly: true },
};
export const 狭いカラム: S = { args: { width: "240px" } };
export const 欄全体で人を探す: S = {
  args: { initial: "al", multiline: false, whole: true },
};
