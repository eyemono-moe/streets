import { type Component, type JSX, Show } from "solid-js";

/**
 * 使い方の案内の 1 枚。中身の差し込み口だけを持ち、ツアーの動き（Ark UI の Tour）
 * には触れない —— ストーリーで各ステップを並べられるように。
 */
const TourCard: Component<{
  title: JSX.Element;
  description: JSX.Element;
  /** 「2 / 5」のような進み具合。 */
  progress?: JSX.Element;
  actions: JSX.Element;
  /** 最初の 1 枚だけ、上に Streets の標識を置く。 */
  welcome?: boolean;
}> = (props) => (
  <div class="c-primary flex w-80 max-w-[calc(100vw-32px)] flex-col gap-3 rounded-3 border border-primary bg-primary p-4 shadow-lg">
    <Show when={props.welcome}>
      <span class="i-streets:logo size-10" aria-hidden="true" />
    </Show>
    <div class="flex items-baseline gap-2">
      <div class="min-w-0 flex-1 font-600 text-body">{props.title}</div>
      <Show when={props.progress}>
        <div class="c-secondary shrink-0 text-caption tabular-nums">
          {props.progress}
        </div>
      </Show>
    </div>
    <div class="c-secondary text-body">{props.description}</div>
    <div class="flex flex-wrap items-center justify-end gap-2">
      {props.actions}
    </div>
  </div>
);

export default TourCard;
