import type { Component } from "solid-js";
import { useDispatch } from "../ui-events";
import { GUIDE } from "./guide";

/** 最初の段に出す Streets の紹介。ここにだけ「Streets について」への入口を置く。 */
const Intro: Component = () => {
  const dispatch = useDispatch();
  return (
    <div class="flex flex-col gap-2.5">
      <p class="font-700 text-h3 leading-snug">
        見たい Nostr を、
        <br />
        見たいだけ並べる。
      </p>
      <p class="text-body">
        Streets は、ブラウザで使える Nostr
        のクライアントです。フォロー中の投稿、通知、ハッシュタグ、リレーの流れをカラムにして、自分だけの画面を組み立てられます。
      </p>
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
