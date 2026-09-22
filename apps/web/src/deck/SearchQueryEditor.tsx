import { parseSearchQuery } from "@streets/core/search/query";
import type { Component } from "solid-js";
import SearchForm from "./SearchForm";

/**
 * 検索の条件を触るところ。打つ人のための入力欄と、項目ごとのフォームを重ねて
 * 出す。どちらも同じ条件を指していて、片方を変えるともう片方に反映される。
 *
 * 「探す」パネルと、検索カラムの設定で同じものを使う —— 後から条件を変える
 * ときに、探したときと同じ触り方でいられるように。
 */
const SearchQueryEditor: Component<{
  text: string;
  onChange: (text: string) => void;
  /** 入力欄に自動で焦点を当てる（開いてすぐ打ち始める場所で使う）。 */
  autofocus?: boolean;
}> = (props) => (
  <div class="flex flex-col gap-3">
    <div class="flex h-10 items-center gap-2 rounded-full border border-primary bg-primary px-3">
      <span
        class="i-material-symbols:search-rounded c-secondary size-4.5 shrink-0"
        aria-hidden="true"
      />
      <input
        class="c-primary placeholder:c-secondary min-w-0 flex-1 bg-transparent text-body outline-none"
        placeholder="ねこ #nostr from:npub1…"
        aria-label="探すもの"
        autofocus={props.autofocus}
        value={props.text}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
    </div>
    <SearchForm
      query={parseSearchQuery(props.text)}
      onChange={props.onChange}
    />
    <p class="c-secondary text-caption">
      入力欄には # でハッシュタグ、from: で書いた人、since: until: で日付、kind:
      で種類を書けます。上の項目と同じものです。
    </p>
  </div>
);

export default SearchQueryEditor;
