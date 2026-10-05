import { Presence } from "@ark-ui/solid/presence";
import { type Component, For, Show, createMemo } from "solid-js";
import Avatar from "../note/Avatar";
import Button from "../ui/Button";

/** 札に並べる人の数。並べるほど札が広がり、狭いカラムで本文を覆う。 */
const AUTHORS_SHOWN = 3;

export type Newer = {
  count: number;
  /** 呼び名（「投稿」など）。 */
  noun: string;
  /** 新しい順。同じ人が続いていてもよい。 */
  authors: readonly string[];
};

/**
 * 先頭へ戻らなかった間に上へ溜まったものを知らせる札。押すと先頭へ戻る。
 * `relative` の親の上端に浮かべる（カラムなら見出しのすぐ下）。
 */
const NewerNotice: Component<{
  /** 溜まっていなければ undefined。札は消える。 */
  newer: Newer | undefined;
  onClick: () => void;
}> = (props) => {
  // 消えていく間も、消える前の中身を描いておく。
  const last = createMemo<Newer | undefined>(
    (previous) => props.newer ?? previous,
  );
  return (
    <Presence
      lazyMount
      unmountOnExit
      present={props.newer !== undefined}
      class="motion-pop pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3"
    >
      <Show when={last()}>
        {(newer) => (
          <Button
            variant="primary"
            size="sm"
            icon="i-material-symbols:arrow-upward-rounded"
            class="pointer-events-auto shadow-sm"
            onClick={() => props.onClick()}
          >
            <span class="inline-flex items-center gap-1.5 align-middle">
              <span class="inline-flex items-center">
                <For
                  each={[...new Set(newer().authors)].slice(0, AUTHORS_SHOWN)}
                >
                  {(pubkey, index) => (
                    <span
                      class="flex rounded-1.5 ring-2 ring-accent-5"
                      classList={{ "-ml-1.5": index() > 0 }}
                    >
                      <Avatar pubkey={pubkey} size="tiny" static />
                    </span>
                  )}
                </For>
              </span>
              新しい {newer().count > 99 ? "99+" : newer().count} 件の
              {newer().noun}
            </span>
          </Button>
        )}
      </Show>
    </Presence>
  );
};

export default NewerNotice;
