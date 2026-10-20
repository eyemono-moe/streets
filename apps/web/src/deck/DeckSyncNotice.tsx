import { type Component, Match, Switch } from "solid-js";
import { t } from "../i18n/locale";
import type { DeckStore } from "./deck-store";

/**
 * デッキの同期でユーザーが動ける異常だけを出す。保存中や同期済みは出さない
 * （画面の上に常駐する情報にはしない）。
 */
const DeckSyncNotice: Component<{ store: DeckStore }> = (props) => (
  <Switch>
    <Match when={props.store.state().phase === "error" && props.store.state()}>
      {(state) => (
        <div
          role="alert"
          class="flex items-center gap-2 bg-secondary px-3 py-2 text-caption"
        >
          <span class="min-w-0 flex-1">
            {t("deck.syncNotice.saveFailed", {
              message:
                state().phase === "error" && "message" in state()
                  ? (state() as { message: string }).message
                  : "",
            })}
          </span>
          <button
            type="button"
            class="c-primary shrink-0 cursor-pointer rounded-full border border-control bg-primary px-3 py-1"
            onClick={() => void props.store.refresh()}
          >
            {t("deck.syncNotice.retry")}
          </button>
        </div>
      )}
    </Match>
    <Match when={props.store.state().phase === "conflict"}>
      <div
        role="alert"
        class="flex items-center gap-2 bg-secondary px-3 py-2 text-caption"
      >
        <span class="min-w-0 flex-1">{t("deck.syncNotice.conflict")}</span>
        <button
          type="button"
          class="c-primary shrink-0 cursor-pointer rounded-full border border-control bg-primary px-3 py-1"
          onClick={() => void props.store.keepLocal()}
        >
          {t("deck.syncNotice.keepLocal")}
        </button>
        <button
          type="button"
          class="c-primary shrink-0 cursor-pointer rounded-full border border-control bg-primary px-3 py-1"
          onClick={() => props.store.useRemote()}
        >
          {t("deck.syncNotice.useRemote")}
        </button>
      </div>
    </Match>
  </Switch>
);

export default DeckSyncNotice;
