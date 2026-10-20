import type { NewerPaging } from "@streets/core/read/newer-page";
import { type Component, Match, Switch } from "solid-js";
import { t } from "../i18n/locale";
import Button from "../ui/Button";
import type { NewerNoun } from "../ui/VirtualList";
import { watchEdge } from "./edge-watch";

/** 端のどれくらい手前で次を取りに行くか。`OlderLoader` と同じく 1 画面ぶんほど先。 */
const AHEAD_PX = 800;

/**
 * 一覧の新しい側の端に置く。近づいたら新しいものを取り足させ、取っている間と、今に追いついた
 * とき、取れなかったときを知らせる。高さはどの状態でも変えない —— 変わると、読んでいる
 * 行ごと一覧が上下に動く。
 */
const NewerLoader: Component<{
  paging: NewerPaging;
  onReach: () => void;
  /** 一覧のどちらの端に置くか。新しいものが下に来る一覧（チャット）では下。 */
  edge?: "top" | "bottom";
  noun?: Extract<NewerNoun, "post" | "message">;
}> = (props) => {
  const noun = () => props.noun ?? "post";
  let sentinel: HTMLDivElement | undefined;
  watchEdge({
    sentinel: () => sentinel,
    margin: () =>
      props.edge === "bottom"
        ? `0px 0px ${AHEAD_PX}px 0px`
        : `${AHEAD_PX}px 0px 0px 0px`,
    idle: () => props.paging === "idle",
    onReach: () => props.onReach(),
  });

  return (
    <div
      ref={sentinel}
      class="c-secondary flex h-14 items-center justify-center gap-2 px-4 text-center text-caption"
    >
      <Switch>
        <Match when={props.paging === "loading"}>
          {t(`deck.newerLoader.loading.${noun()}`)}
        </Match>
        <Match when={props.paging === "caught-up"}>
          {t(`deck.newerLoader.caughtUp.${noun()}`)}
        </Match>
        <Match when={props.paging === "failed"}>
          <span>{t(`deck.newerLoader.failed.${noun()}`)}</span>
          <Button size="sm" onClick={() => props.onReach()}>
            {t("deck.newerLoader.retry")}
          </Button>
        </Match>
      </Switch>
    </div>
  );
};

export default NewerLoader;
