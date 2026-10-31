import type { Nip78Document } from "@streets/core/solid/create-nip78-document";
import { type Component, Match, Switch } from "solid-js";
import { t, message } from "../i18n/locale";

/** 何を同期しているか。 */
type SyncSubject = "deck" | "applets";

/**
 * アカウントへの同期でユーザーが動ける異常だけを出す。保存中や同期済みは出さない
 * （画面の上に常駐する情報にはしない）。
 */
const DeckSyncNotice: Component<{
  store: Nip78Document<unknown>;
  subject?: SyncSubject;
}> = (props) => {
  const failure = () => {
    const state = props.store.state();
    return state.phase === "error" ? state.message : undefined;
  };
  const applets = () => props.subject === "applets";
  return (
    <Switch>
      <Match when={failure()}>
        {(text) => (
          <div
            role="alert"
            class="flex items-center gap-2 bg-secondary px-3 py-2 text-caption"
          >
            <span class="min-w-0 flex-1">
              {applets()
                ? t("deck.syncNotice.appletsSaveFailed", {
                    message: message(text()),
                  })
                : t("deck.syncNotice.saveFailed", {
                    message: message(text()),
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
          <span class="min-w-0 flex-1">
            {applets()
              ? t("deck.syncNotice.appletsConflict")
              : t("deck.syncNotice.conflict")}
          </span>
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
};

export default DeckSyncNotice;
