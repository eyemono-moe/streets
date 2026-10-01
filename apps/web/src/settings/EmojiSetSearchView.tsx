import type { EmojiSet } from "@streets/core/settings/emoji-set";
import { type Component, For, Show, createSignal } from "solid-js";
import { useUserCandidates, userSource } from "../completion/sources";
import {
  EmojiGrid,
  EmojiSetAddButton,
  EmojiSetHeading,
} from "../emoji/EmojiSetParts";
import Button from "../ui/Button";
import SearchInput from "../ui/SearchInput";

export type EmojiSetResult = {
  set: EmojiSet;
  /** もう自分の絵文字に入っている。 */
  added: boolean;
};

export type EmojiSetSearchViewProps = {
  results: readonly EmojiSetResult[];
  /** 言葉で絞らず、新しく作られたものを並べている。 */
  recent: boolean;
  /** 問い合わせている途中。 */
  searching: boolean;
  /** 一度でも探したか。まだなら「見つかりません」を出さない。 */
  searched: boolean;
  /** 保存している途中は足させない。 */
  disabled: boolean;
  error?: string;
  onSearch: (text: string) => void;
  /** 続きを取る。取れるものが無い・取っている途中なら undefined。 */
  onMore?: () => void;
};

/**
 * 絵文字セットを探す。名前のほかに npub や naddr も受ける —— kind:30030 を
 * 索引しているリレーは少なく、言葉だけでは見つからないことがあるため。
 */
const EmojiSetSearchView: Component<EmojiSetSearchViewProps> = (props) => {
  const [text, setText] = createSignal("");
  // @ で人を選ぶと、その人のセットを探せる。
  const sources = [
    userSource(useUserCandidates(), { format: (nprofile) => nprofile }),
  ];
  return (
    <div class="flex flex-col gap-2.5">
      <form
        class="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSearch(text());
        }}
      >
        <SearchInput
          class="min-w-48 flex-1"
          label="絵文字セットを探す"
          placeholder="ねこ / @名前 / npub1… / naddr1…"
          completion={sources}
          completionLabel="人の候補"
          aria-invalid={props.error !== undefined}
          aria-describedby={props.error ? "emoji-set-search-error" : undefined}
          value={text()}
          onValueChange={setText}
        />
        <Button
          type="submit"
          variant="primary"
          icon="i-material-symbols:search-rounded"
        >
          探す
        </Button>
      </form>
      <Show when={props.error}>
        {(message) => (
          <p id="emoji-set-search-error" class="c-danger text-caption">
            {message()}
          </p>
        )}
      </Show>
      <Show when={props.searching}>
        <p class="c-secondary text-caption">探しています…</p>
      </Show>
      <Show when={props.results.length > 0}>
        <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <For each={props.results}>
            {(result) => (
              <ResultRow result={result} disabled={props.disabled} />
            )}
          </For>
        </ul>
      </Show>
      <Show
        when={props.searched && !props.searching && props.results.length === 0}
      >
        <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
          見つかりませんでした。言葉での検索に答えるリレーは多くありません。入力を空にして押すと新しく作られたものが並びます。作った人の
          npub か、セットの naddr を貼っても取り込めます。
        </p>
      </Show>
    </div>
  );
};

const ResultRow: Component<{ result: EmojiSetResult; disabled: boolean }> = (
  props,
) => (
  <li class="flex flex-col gap-2 bg-primary px-3 py-2.5">
    <EmojiSetHeading
      title={props.result.set.title}
      pubkey={props.result.set.pubkey}
      count={props.result.set.emojis.length}
    />
    <EmojiGrid emojis={props.result.set.emojis} />
    <div class="flex">
      <EmojiSetAddButton
        set={props.result.set}
        added={props.result.added}
        disabled={props.disabled}
      />
    </div>
  </li>
);

export default EmojiSetSearchView;
