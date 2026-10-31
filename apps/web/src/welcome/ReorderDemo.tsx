import { type Component, For } from "solid-js";
import { t } from "../i18n/locale";

type MiniColumn = {
  icon: string;
  /** 並びの中の位置（flex の order）。 */
  order: number;
  motion?: string;
};

// 掴んだカラムは隣のカラムの上を通るので、DOM の最後に置いて上に描かせる。位置は order で決める。
const COLUMNS: MiniColumn[] = [
  { icon: "i-material-symbols:home-outline-rounded", order: 1 },
  {
    icon: "i-material-symbols:search-rounded",
    order: 3,
    motion: "animate-demo-make-way",
  },
  { icon: "i-material-symbols:person-outline-rounded", order: 4 },
  {
    icon: "i-material-symbols:notifications-outline-rounded",
    order: 2,
    motion: "animate-demo-carry shadow-lg",
  },
];

/**
 * カラムの見出しを掴んで横へ動かす様子。動画にせず小さなデッキを描いて動かし、
 * テーマの色にそのまま合わせる。本物のデッキと紛れないよう、掴んで動かせはしない。
 */
const ReorderDemo: Component = () => (
  <div
    role="img"
    aria-label={t("welcome.reorderDemo.label")}
    class="flex h-36 gap-1.5 overflow-hidden rounded-3 border border-primary bg-secondary p-3"
  >
    <For each={COLUMNS}>
      {(column) => (
        <div
          class={`flex min-w-0 flex-1 flex-col gap-2 rounded-2 border border-primary bg-primary p-2 ${column.motion ?? ""}`}
          style={{ order: column.order }}
        >
          <div class="flex items-center gap-1.5">
            <span
              class={`${column.icon} c-secondary size-4 shrink-0`}
              aria-hidden="true"
            />
            <span class="h-2 flex-1 rounded-full bg-tertiary" />
          </div>
          <For each={[0.9, 0.7, 0.8]}>
            {(width) => (
              <span
                class="h-1.5 rounded-full bg-secondary"
                style={{ width: `${width * 100}%` }}
              />
            )}
          </For>
        </div>
      )}
    </For>
  </div>
);

export default ReorderDemo;
