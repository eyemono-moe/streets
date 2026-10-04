import {
  GUIDE_CATEGORIES,
  guidesInCategory,
} from "@streets/core/signal/guides";
import { type Component, For, Show } from "solid-js";

type GuideCategory = (typeof GUIDE_CATEGORIES)[number];

/** 分類 API が無くても辿れる案内の一覧。 */
const GuideBrowserView: Component<{ category?: GuideCategory }> = (props) => (
  <main class="h-full overflow-y-auto bg-primary px-4 py-5 text-body">
    <div class="mx-auto flex max-w-2xl flex-col gap-6">
      <nav
        class="flex flex-wrap gap-x-3 gap-y-1 text-caption"
        aria-label="案内"
      >
        <Show when={props.category}>
          <a href="/help" class="c-accent-5 hover:underline">
            使い方を探す
          </a>
        </Show>
      </nav>
      <header class="flex flex-col gap-2">
        <p class="c-secondary text-caption">Streets の使い方</p>
        <h1 class="text-xl font-700">
          {props.category?.title ?? "何について知りたい？"}
        </h1>
        <p class="c-secondary">
          {props.category?.description ??
            "知りたい項目を選ぶと、使い方を確認できます。"}
        </p>
      </header>
      <div class="flex flex-col gap-2">
        <For
          each={
            props.category
              ? guidesInCategory(props.category.id)
              : GUIDE_CATEGORIES
          }
        >
          {(item) => (
            <a
              href={item.path}
              class="group c-primary flex items-center gap-3 rounded-2 border border-primary bg-primary px-3.5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-5 hover:bg-secondary"
            >
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="font-600 text-body">{item.title}</span>
                <Show when={"description" in item}>
                  <span class="c-secondary text-caption">
                    {item.description}
                  </span>
                </Show>
              </span>
              <span
                class="i-material-symbols:chevron-right-rounded c-secondary size-5 shrink-0"
                aria-hidden="true"
              />
            </a>
          )}
        </For>
      </div>
    </div>
  </main>
);

export default GuideBrowserView;
