import { type Component, Match, Show, Switch } from "solid-js";
import Button from "../../../shared/components/UI/Button";
import { useDeckStore } from "../deck-store";
import SettingsPage from "./SettingsPage";

const formatSyncedAt = (createdAt: number | undefined): string | undefined =>
  createdAt === undefined
    ? undefined
    : new Date(createdAt * 1_000).toLocaleString();

/** Account ページの最初の実項目。同期の判断と操作は DeckStore に委ねる。 */
const AccountSettingsPage: Component = () => {
  const deck = useDeckStore();
  const readyState = () => {
    const state = deck.state();
    return state.phase === "ready" ? state : undefined;
  };
  const errorState = () => {
    const state = deck.state();
    return state.phase === "error" ? state : undefined;
  };
  const conflictState = () => {
    const state = deck.state();
    return state.phase === "conflict" ? state : undefined;
  };

  return (
    <SettingsPage
      title="アカウント"
      description="アカウントに紐づくデータの同期状態を確認します。"
    >
      <section class="mt-5 rounded-2 border border-primary p-4">
        <h3 class="font-700 text-body">デッキ同期</h3>
        <p class="c-secondary mt-1 text-caption">
          カラムの並びと設定を暗号化し、同じアカウントの端末間で同期します。
        </p>

        <div class="mt-4" data-testid="deck-sync-state">
          <Switch>
            <Match when={deck.state().phase === "signed-out"}>
              <p class="c-secondary text-body">
                デッキを同期するにはログインしてください。
              </p>
            </Match>
            <Match when={deck.state().phase === "loading"}>
              <p class="c-secondary text-body">同期を確認しています…</p>
            </Match>
            <Match when={readyState()?.sync === "pending"}>
              <p class="c-secondary text-body">同期待ち</p>
            </Match>
            <Match when={readyState()?.sync === "saving"}>
              <p class="c-secondary text-body">保存しています…</p>
            </Match>
            <Match when={readyState()?.sync === "synced"}>
              <p class="text-body">同期済み</p>
              <Show when={formatSyncedAt(readyState()?.remoteCreatedAt)}>
                {(date) => (
                  <p class="c-secondary mt-1 text-caption">
                    最終同期: {date()}
                  </p>
                )}
              </Show>
            </Match>
            <Match when={errorState()}>
              {(state) => (
                <div class="rounded-2 border border-red-6 bg-red-4/10 p-3 text-caption text-red-8 dark:text-red-4">
                  <p>{state().message}</p>
                  <Show when={state().retryable}>
                    <Button
                      class="mt-3"
                      data-testid="deck-sync-retry"
                      variant="border"
                      onClick={() => void deck.refresh()}
                    >
                      再試行
                    </Button>
                  </Show>
                </div>
              )}
            </Match>
            <Match when={conflictState()}>
              {(state) => (
                <div class="rounded-2 border border-yellow-6 bg-yellow-4/10 p-3 text-caption">
                  <p>この端末とリレーのデッキが両方変更されています。</p>
                  <p class="c-secondary mt-1">
                    リレーの更新: {formatSyncedAt(state().remoteCreatedAt)}
                  </p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <Button
                      data-testid="deck-sync-keep-local"
                      onClick={() => void deck.keepLocal()}
                    >
                      この端末のデッキを保存
                    </Button>
                    <Button
                      data-testid="deck-sync-use-remote"
                      variant="dangerBorder"
                      onClick={deck.useRemote}
                    >
                      リレーのデッキを使う
                    </Button>
                  </div>
                </div>
              )}
            </Match>
          </Switch>
        </div>
      </section>
    </SettingsPage>
  );
};

export default AccountSettingsPage;
