import {
  type SearchQuery,
  formatSearchQuery,
} from "@streets/core/search/query";
import { type Component, Show } from "solid-js";
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
  const words = (text: string) =>
    text.split(/\s+/).filter((word) => word.length > 0);

  return (
    <div class="flex flex-col gap-2.5">
      <Field id="search-words" label="単語">
        <input
          id="search-words"
          class={inputClass}
          placeholder="ねこ"
          value={props.query.words.join(" ")}
          onChange={(event) =>
            patch({ words: words(event.currentTarget.value) })
          }
        />
      </Field>
      <Field id="search-hashtags" label="ハッシュタグ">
        <input
          id="search-hashtags"
          class={inputClass}
          placeholder="nostr"
          value={props.query.hashtags.join(" ")}
          onChange={(event) =>
            patch({
              hashtags: words(event.currentTarget.value).map((tag) =>
                tag.replace(/^#/, "").toLowerCase(),
              ),
            })
          }
        />
      </Field>
      <Field id="search-from" label="書いた人">
        <input
          id="search-from"
          class={inputClass}
          placeholder="npub1… / nprofile1…"
          value={props.query.from ?? ""}
          onChange={(event) =>
            patch({ from: event.currentTarget.value.trim() || undefined })
          }
        />
      </Field>
      <Field id="search-to" label="宛先">
        <input
          id="search-to"
          class={inputClass}
          placeholder="npub1… / nprofile1…"
          value={props.query.to ?? ""}
          onChange={(event) =>
            patch({ to: event.currentTarget.value.trim() || undefined })
          }
        />
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
      <Show when={props.query.from || props.query.to}>
        <p class="c-secondary text-caption">
          人の指定は、入力欄では 16 進の公開鍵として書き戻されます（指すものは
          同じです）。
        </p>
      </Show>
    </div>
  );
};

export default SearchForm;
