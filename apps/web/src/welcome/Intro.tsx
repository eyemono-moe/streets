import { type Component, For } from "solid-js";
import { useDispatch } from "../ui-events";
import { GUIDE } from "./guide";

/** 並んだカラムを見ただけでは伝わらないことを、短く並べる。 */
const FEATURES = [
  {
    icon: "i-material-symbols:view-column-outline-rounded",
    label: "カラムはいくつでも足して、並べ替えられます。",
  },
  {
    icon: "i-material-symbols:forum-outline-rounded",
    label: "投稿を押すと、そのカラムの中でスレッドが開きます。",
  },
  {
    icon: "i-material-symbols:key-outline-rounded",
    label: "秘密鍵を Streets に渡さずにログインできます。",
  },
];

/** 最初の段に出す Streets の紹介。ここにだけ「Streets について」への入口を置く。 */
const Intro: Component = () => {
  const dispatch = useDispatch();
  return (
    <div class="flex flex-col gap-2.5">
      <p class="font-700 text-[24px] leading-snug">See it your way.</p>
      <p class="text-body">
        Streets はブラウザで使う Nostr
        クライアントです。タイムラインや通知、検索結果をカラムにして並べられます。
      </p>
      <ul class="flex flex-col gap-1.5 py-1 text-caption">
        <For each={FEATURES}>
          {(feature) => (
            <li class="flex items-start gap-1.5">
              <span
                class={`${feature.icon} c-accent-5 mt-0.5 size-4 shrink-0`}
                aria-hidden="true"
              />
              {feature.label}
            </li>
          )}
        </For>
      </ul>
      <p class="flex flex-wrap gap-x-4 gap-y-1 text-caption">
        <a
          href={GUIDE}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-0.5 text-link"
        >
          Nostr についてもっと知る
          <span
            class="i-material-symbols:open-in-new-rounded size-3.5"
            aria-hidden="true"
          />
        </a>
        <button
          type="button"
          class="c-secondary cursor-pointer bg-transparent p-0 hover:underline"
          onClick={() => dispatch({ type: "deck/open-about" })}
        >
          Streets について・プライバシーポリシー
        </button>
      </p>
    </div>
  );
};

export default Intro;
