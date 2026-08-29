import { type Component, Show, createSignal } from "solid-js";
import Button from "../../shared/components/UI/Button";
import { useFollowState } from "./follow-state";

const FollowButton: Component<{ pubkey: string }> = (props) => {
  const state = useFollowState();
  const [hovered, setHovered] = createSignal(false);
  const following = () => state.isFollowing(props.pubkey);
  const saving = () => state.isSaving(props.pubkey);
  const error = () => state.error(props.pubkey);

  return (
    <Show when={props.pubkey !== state.viewer}>
      <div class="flex flex-col items-end gap-1">
        <Button
          data-testid="follow-button"
          variant={
            following() ? (hovered() ? "dangerBorder" : "border") : "primary"
          }
          disabled={saving()}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={(event) => {
            event.stopPropagation();
            void (following()
              ? state.unfollow(props.pubkey)
              : state.follow(props.pubkey));
          }}
        >
          <Show
            when={!saving()}
            fallback={
              <>
                <span class="i-material-symbols:progress-activity h-4 w-4 animate-spin" />
                送信中…
              </>
            }
          >
            <Show
              when={following()}
              fallback={
                <>
                  <span class="i-material-symbols:add-rounded h-4 w-4" />
                  フォロー
                </>
              }
            >
              <Show
                when={hovered()}
                fallback={
                  <>
                    <span class="i-material-symbols:check-rounded h-4 w-4" />
                    フォロー中
                  </>
                }
              >
                <span class="i-material-symbols:close-rounded h-4 w-4" />
                フォロー解除
              </Show>
            </Show>
          </Show>
        </Button>
        <Show when={error()}>
          {(current) => (
            <div class="max-w-52 text-right text-red-7 text-xs dark:text-red-4">
              <p role="alert">{current().message}</p>
              <button
                type="button"
                class="underline enabled:cursor-pointer disabled:opacity-50"
                disabled={saving()}
                onClick={(event) => {
                  event.stopPropagation();
                  void state.retry(props.pubkey);
                }}
              >
                再試行
              </button>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
};

export default FollowButton;
