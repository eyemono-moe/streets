import type { NewerPaging } from "@streets/core/read/newer-page";
import { type Component, Match, Switch } from "solid-js";
import Button from "../ui/Button";
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
  /** 何を取るか（「投稿」「発言」など）。 */
  noun?: string;
}> = (props) => {
  const noun = () => props.noun ?? "投稿";
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
          新しい{noun()}を読み込み中…
        </Match>
        <Match when={props.paging === "caught-up"}>
          最新の{noun()}に追いつきました
        </Match>
        <Match when={props.paging === "failed"}>
          <span>新しい{noun()}を読み込めませんでした</span>
          <Button size="sm" onClick={() => props.onReach()}>
            もう一度読み込む
          </Button>
        </Match>
      </Switch>
    </div>
  );
};

export default NewerLoader;
