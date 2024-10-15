import type { Component } from "solid-js";
import { copyToClipboard } from "../libs/clipboard";

const CopyablePre: Component<{
  content: string;
}> = (props) => {
  return (
    <div class="parent relative rounded-2 bg-zinc-1 px-2 py-1">
      <button
        class="parent-hover:op-100 op-0 b-1 c-zinc-5 absolute top-1 right-1 appearance-none rounded-2 bg-transparent bg-zinc-1 p-1 transition-opacity duration-100 enabled:hover:bg-zinc-2"
        type="button"
        onClick={() => {
          copyToClipboard(props.content);
        }}
      >
        <div class="aspect-square h-0.75lh w-auto i-material-symbols:content-copy-outline-rounded" />
      </button>
      <pre class="overflow-x-auto">
        <code>{props.content}</code>
      </pre>
    </div>
  );
};

export default CopyablePre;
