import type { Guide } from "@streets/core/signal/guides";
import { type Component, For, Show } from "solid-js";

/** URL から開いた Guide の表示。閲覧 UI の入口は次の段階で足す。 */
const GuidePageView: Component<{ guide?: Guide }> = (props) => (
  <main class="h-dvh overflow-y-auto bg-primary px-5 py-8 text-body">
    <div class="mx-auto flex max-w-2xl flex-col gap-6">
      <nav
        class="flex flex-wrap gap-x-3 gap-y-1 text-caption"
        aria-label="案内"
      >
        <a href="/" class="c-accent-5 hover:underline">
          Streets に戻る
        </a>
        <a href="/help" class="c-accent-5 hover:underline">
          使い方を探す
        </a>
        <Show when={props.guide}>
          {(guide) => (
            <a
              href={`/help/${guide().category}`}
              class="c-accent-5 hover:underline"
            >
              このカテゴリに戻る
            </a>
          )}
        </Show>
      </nav>
      <Show
        when={props.guide}
        fallback={
          <section class="flex flex-col gap-3">
            <h1 class="text-xl font-700">案内が見つかりません</h1>
            <p class="c-secondary">
              この案内の URL は使えません。Streets に戻ってください。
            </p>
          </section>
        }
      >
        {(guide) => (
          <article class="flex flex-col gap-5">
            <header class="flex flex-col gap-2">
              <p class="c-secondary text-caption">Streets の使い方</p>
              <h1 class="text-xl font-700">{guide().title}</h1>
            </header>
            <div class="flex flex-col gap-4 leading-relaxed">
              <For each={guide().content}>{(part) => <p>{part}</p>}</For>
            </div>
          </article>
        )}
      </Show>
    </div>
  </main>
);

export default GuidePageView;
