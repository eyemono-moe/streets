import { Collapsible } from "@ark-ui/solid/collapsible";
import { parseSearchQuery } from "@streets/core/search/query";
import {
  type Component,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { useUserCandidates, userSource } from "../completion/sources";
import SearchInput from "../ui/SearchInput";
import SearchForm from "./SearchForm";

/**
 * 検索の条件を触るところ。項目ごとのフォームは必要なときだけ開く。
 * どちらも同じ条件を指していて、片方を変えるともう片方に反映される。
 *
 * 「探す」パネルと、検索カラムの設定で同じものを使う —— 後から条件を変える
 * ときに、探したときと同じ触り方でいられるように。
 */
const SearchQueryEditor: Component<{
  text: string;
  signedIn: boolean;
  onChange: (text: string) => void;
  /** 入力欄に自動で焦点を当てる（開いてすぐ打ち始める場所で使う）。 */
  autofocus?: boolean;
  /** 入力欄で Enter を押した（候補を選ぶ Enter と変換を確定する Enter は除く）。 */
  onSubmit?: () => void;
  /**
   * 打つたびに上へ渡さず、この時間だけ待つ（ミリ秒）。カラムの設定のように、
   * 渡した瞬間に購読し直す場所で使う。0 ならすぐ渡す。
   */
  debounceMs?: number;
}> = (props) => {
  // 上へ渡す前の、打っている途中の文字。渡したあとも消さない —— 末尾の空白を
  // 落とされると、続けて打てなくなる。
  const [draft, setDraft] = createSignal<string>();
  const shown = () => draft() ?? props.text;

  /** 変換の途中は、候補を選ぶたびに上へ渡さない。 */
  let composing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sent: string | undefined;
  onCleanup(() => clearTimeout(timer));

  // 外から変わったとき（フォームで触った・別のカラムを開いた）は、打っている
  // 途中の文字を捨てて、渡ってきたものを出す。
  createEffect(() => {
    if (props.text !== sent) setDraft(undefined);
  });

  const send = (value: string) => {
    sent = value;
    props.onChange(value);
  };

  const typed = (value: string) => {
    setDraft(value);
    clearTimeout(timer);
    if (composing) return;
    const wait = props.debounceMs ?? 0;
    if (wait === 0) {
      send(value);
      return;
    }
    timer = setTimeout(() => send(value), wait);
  };

  /** 項目ごとのフォームからの変更。打っている途中とは違い、その場で渡す。 */
  /**
   * 開いたときに打ち始められるようにする。`autofocus` 属性は、後から差し込んだ
   * 要素には効かないので、自分で当てる。パネルは開く動きの途中でまだ画面の外に
   * ずれているので、スクロールさせない（させると、外側の箱ごと動く）。
   */
  let input: HTMLInputElement | undefined;
  // from: / to: の後ろ、または @ で人を選べる。@ は人の参照だけに置き換え、
  // from: を足さない —— `to:@` から選ぶと `to:from:…` になってしまう。
  const people = useUserCandidates();
  const sources = [
    userSource(people, {
      trigger: {
        kind: "user",
        prefixes: ["from:", "by:", "to:"],
        keepPrefix: true,
      },
      format: (nprofile) => nprofile,
      space: true,
    }),
    userSource(people, {
      format: (nprofile) => nprofile,
      space: true,
    }),
  ];
  onMount(() => {
    if (props.autofocus) input?.focus({ preventScroll: true });
  });

  const chosen = (value: string) => {
    clearTimeout(timer);
    setDraft(undefined);
    send(value);
  };

  return (
    <div class="flex flex-col gap-3">
      <SearchInput
        ref={(el) => {
          input = el;
        }}
        label="検索クエリ"
        placeholder="ねこ #nostr from:npub1…"
        completion={sources}
        value={shown()}
        onValueChange={typed}
        enterkeyhint={props.onSubmit ? "search" : undefined}
        onKeyDown={(event) => {
          if (
            event.key !== "Enter" ||
            event.defaultPrevented ||
            event.isComposing ||
            event.keyCode === 229 ||
            !props.onSubmit
          )
            return;
          event.preventDefault();
          // 待っている途中の文字も渡してから探す。
          clearTimeout(timer);
          send(event.currentTarget.value);
          props.onSubmit();
        }}
        onCompositionStart={() => {
          composing = true;
          clearTimeout(timer);
        }}
        onCompositionEnd={(event) => {
          composing = false;
          typed(event.currentTarget.value);
        }}
        onBlur={(event) => {
          // 離れるときは待たない。閉じる直前の 1 文字を落とさないため。
          if (!composing) {
            clearTimeout(timer);
            send(event.currentTarget.value);
          }
        }}
      />
      <Collapsible.Root lazyMount unmountOnExit>
        <Collapsible.Trigger class="group c-secondary flex w-full cursor-pointer items-center gap-1 rounded-2 bg-transparent py-1 text-left text-caption outline-none focus-visible:ring-2 focus-visible:ring-accent-5">
          <span
            class="i-material-symbols:expand-more-rounded size-5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
          詳細な条件
        </Collapsible.Trigger>
        <Collapsible.Content class="motion-collapse">
          <div class="pt-2">
            <SearchForm
              query={parseSearchQuery(shown())}
              signedIn={props.signedIn}
              onChange={chosen}
            />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
};

export default SearchQueryEditor;
