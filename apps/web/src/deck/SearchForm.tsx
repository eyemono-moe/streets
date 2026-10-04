import {
  type SearchQuery,
  formatSearchQuery,
} from "@streets/core/search/query";
import { type Component, Show } from "solid-js";
import { useUserCandidates, userSource } from "../completion/sources";
import Completion from "../ui/Completion";
import ExperimentalBadge from "../ui/ExperimentalBadge";
import Switch from "../ui/Switch";
import { textInputClass } from "../ui/TextField";

/** 秒 → `yyyy-mm-dd`（日付の入力欄の形）。 */
const toDateInput = (seconds: number | undefined): string => {
  if (seconds === undefined) return "";
  const date = new Date(seconds * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** `yyyy-mm-dd` → 秒。空なら指定なし。 */
const fromDateInput = (value: string): number | undefined => {
  if (value === "") return undefined;
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? undefined : Math.floor(time / 1000);
};

const Field: Component<{ id: string; label: string; children: unknown }> = (
  props,
) => (
  <div class="flex flex-col gap-1">
    <label class="c-secondary font-600 text-caption" for={props.id}>
      {props.label}
    </label>
    {props.children as never}
  </div>
);

const inputClass = `${textInputClass} w-full`;

/**
 * 検索の条件を項目ごとに触る。入力欄の文字列と同じものを指していて、どちらを
 * 変えてももう一方に反映される（打つのが速い人は文字列、迷う人はこちら）。
 */
const SearchForm: Component<{
  query: SearchQuery;
  onChange: (text: string) => void;
}> = (props) => {
  const patch = (change: Partial<SearchQuery>) =>
    props.onChange(formatSearchQuery({ ...props.query, ...change }));
  // 「書いた人」「宛先」は、除く人も - を付けて並べるので、カーソルのある言葉で人を探す。
  const people = [
    userSource(useUserCandidates(), {
      trigger: { kind: "user", prefixes: [], words: true },
      format: (nprofile) => nprofile,
      space: true,
    }),
  ];
  const words = (text: string) =>
    text.split(/\s+/).filter((word) => word.length > 0);
  // `-` を付けたものは除く。手元でふるうだけなので、欄を分けて勧めはしない。
  const signed = (text: string) => {
    const include: string[] = [];
    const exclude: string[] = [];
    for (const word of words(text)) {
      if (word.startsWith("-") && word.length > 1 && word[1] !== "-") {
        exclude.push(word.slice(1));
      } else {
        include.push(word);
      }
    }
    return { include, exclude };
  };
  const shownSigned = (include: string[], exclude: string[]) =>
    [...include, ...exclude.map((word) => `-${word}`)].join(" ");
  const toTag = (tag: string) => tag.replace(/^#/, "").toLowerCase();

  return (
    <div class="flex flex-col gap-2.5">
      <Field id="search-words" label="単語">
        <input
          id="search-words"
          class={inputClass}
          placeholder="ねこ -いぬ"
          value={shownSigned(props.query.words, props.query.excludeWords)}
          onChange={(event) => {
            const { include, exclude } = signed(event.currentTarget.value);
            patch({ words: include, excludeWords: exclude });
          }}
        />
      </Field>
      <Field id="search-hashtags" label="ハッシュタグ">
        <input
          id="search-hashtags"
          class={inputClass}
          placeholder="nostr -bot"
          value={shownSigned(props.query.hashtags, props.query.excludeHashtags)}
          onChange={(event) => {
            const { include, exclude } = signed(event.currentTarget.value);
            patch({
              hashtags: include.map(toTag),
              excludeHashtags: exclude.map(toTag),
            });
          }}
        />
      </Field>
      <Switch
        label="フォローしている人に限定"
        checked={props.query.from === "follows"}
        onChange={(checked) => patch({ from: checked ? "follows" : undefined })}
      />
      <Field
        id="search-from"
        label={props.query.from === "follows" ? "除く人" : "書いた人"}
      >
        <Completion sources={people} label="人の候補">
          {(attach) => (
            <input
              ref={attach}
              id="search-from"
              class={inputClass}
              placeholder={
                props.query.from === "follows"
                  ? "-npub1…"
                  : "npub1… / nprofile1…"
              }
              value={shownSigned(
                props.query.from && props.query.from !== "follows"
                  ? [props.query.from]
                  : [],
                props.query.excludeFrom,
              )}
              onChange={(event) => {
                const { include, exclude } = signed(event.currentTarget.value);
                // フォロー中に限定したまま、特定の人だけは除ける。
                if (props.query.from === "follows") {
                  patch({ excludeFrom: [...include, ...exclude] });
                  return;
                }
                // 絞る人は 1 人だけ。文字列で何人も書いたときと同じく、後ろを使う。
                patch({ from: include.at(-1), excludeFrom: exclude });
              }}
            />
          )}
        </Completion>
      </Field>
      <Field id="search-to" label="宛先">
        <Completion sources={people} label="人の候補">
          {(attach) => (
            <input
              ref={attach}
              id="search-to"
              class={inputClass}
              placeholder="npub1… / nprofile1…"
              value={shownSigned(
                props.query.to ? [props.query.to] : [],
                props.query.excludeTo,
              )}
              onChange={(event) => {
                const { include, exclude } = signed(event.currentTarget.value);
                // 絞る人は 1 人だけ。文字列で何人も書いたときと同じく、後ろを使う。
                patch({ to: include.at(-1), excludeTo: exclude });
              }}
            />
          )}
        </Completion>
      </Field>
      <div class="flex gap-2">
        <div class="min-w-0 flex-1">
          <Field id="search-since" label="この日から">
            <input
              id="search-since"
              type="date"
              class={inputClass}
              value={toDateInput(props.query.since)}
              onChange={(event) =>
                patch({ since: fromDateInput(event.currentTarget.value) })
              }
            />
          </Field>
        </div>
        <div class="min-w-0 flex-1">
          <Field id="search-until" label="この日まで">
            <input
              id="search-until"
              type="date"
              class={inputClass}
              value={toDateInput(props.query.until)}
              onChange={(event) =>
                patch({ until: fromDateInput(event.currentTarget.value) })
              }
            />
          </Field>
        </div>
      </div>
      <Field id="search-kinds" label="kind">
        <input
          id="search-kinds"
          class={inputClass}
          placeholder="1（省略するとテキストノート）"
          value={props.query.kinds.join(" ")}
          onChange={(event) =>
            patch({
              kinds: words(event.currentTarget.value)
                .map((value) => Number.parseInt(value, 10))
                .filter((kind) => Number.isInteger(kind) && kind >= 0),
            })
          }
        />
      </Field>
      {/* プロフィールで名乗っている人しか除けず効きにくいので、印で示す。 */}
      <Switch
        label="botを除く"
        checked={props.query.excludeBots}
        onChange={(checked) => patch({ excludeBots: checked })}
        aside={<ExperimentalBadge />}
      />
      <Show
        when={
          (props.query.from && props.query.from !== "follows") ||
          props.query.to ||
          props.query.excludeFrom.length > 0 ||
          props.query.excludeTo.length > 0
        }
      >
        <p class="c-secondary text-caption">
          人の指定は、入力欄では 16 進の公開鍵として書き戻されます（指すものは
          同じです）。
        </p>
      </Show>
    </div>
  );
};

export default SearchForm;
