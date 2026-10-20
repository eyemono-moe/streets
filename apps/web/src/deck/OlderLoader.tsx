import type { Paging } from "@streets/core/read/source";
import { type Component, Match, Switch } from "solid-js";
import { t } from "../i18n/locale";
import Button from "../ui/Button";
import { watchEdge } from "./edge-watch";

/** 下端のどれくらい手前で次を取りに行くか。1 画面ぶんほど先に取り始める。 */
const AHEAD_PX = 800;

/**
 * 一覧の下端に置く。近づいたら古い投稿を 1 ページぶん取り足させ、取っている間と
 * もう無いとき、取れなかったときを知らせる。
 */
const OlderLoader: Component<{
  paging: Paging;
  onReach: () => void;
}> = (props) => {
  let sentinel: HTMLDivElement | undefined;
  watchEdge({
    sentinel: () => sentinel,
    margin: () => `0px 0px ${AHEAD_PX}px 0px`,
    idle: () => props.paging === "idle",
    onReach: () => props.onReach(),
  });

  return (
    <div ref={sentinel} class="c-secondary p-4 text-center text-caption">
      <Switch>
        {/* 取り足すのは最初のページが揃ってから。黙っていると、下端まで来ても止まって見える。 */}
        <Match when={props.paging === "waiting"}>
          {t("deck.olderLoader.waiting")}
        </Match>
        <Match when={props.paging === "loading"}>
          {t("deck.olderLoader.loading")}
        </Match>
        <Match when={props.paging === "exhausted"}>
          {t("deck.olderLoader.exhausted")}
        </Match>
        {/* 返事をしないリレーがあると、もう無いのかどうか分からない。無いとは言わない。 */}
        <Match when={props.paging === "failed"}>
          <div class="flex flex-col items-center gap-2">
            <p>{t("deck.olderLoader.failed")}</p>
            <Button size="sm" onClick={() => props.onReach()}>
              {t("deck.olderLoader.retry")}
            </Button>
          </div>
        </Match>
      </Switch>
    </div>
  );
};

export default OlderLoader;
