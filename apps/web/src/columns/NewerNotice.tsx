import { type Component, For } from "solid-js";
import Avatar from "../note/Avatar";
import Button from "../ui/Button";

/** 札に並べる人の数。並べるほど札が広がり、狭いカラムで本文を覆う。 */
const AUTHORS_SHOWN = 3;

/**
 * 先頭へ戻らなかった間に上へ溜まったものを知らせる札。押すと先頭へ戻る。
 * カラムの見出しのすぐ下に浮かべる。
 */
const NewerNotice: Component<{
  count: number;
  /** 呼び名（「投稿」など）。 */
  noun: string;
  /** 新しい順。同じ人が続いていてもよい。 */
  authors: readonly string[];
  onClick: () => void;
}> = (props) => {
  const shown = () => [...new Set(props.authors)].slice(0, AUTHORS_SHOWN);
  return (
    <Button
      variant="primary"
      size="sm"
      icon="i-material-symbols:arrow-upward-rounded"
      class="motion-pop pointer-events-auto shadow-sm"
      onClick={() => props.onClick()}
    >
      <span class="inline-flex items-center gap-1.5 align-middle">
        <span class="inline-flex items-center">
          <For each={shown()}>
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
        新しい {props.count > 99 ? "99+" : props.count} 件の{props.noun}
      </span>
    </Button>
  );
};

export default NewerNotice;
