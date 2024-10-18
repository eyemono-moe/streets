import type { Component } from "solid-js";
import { copyToClipboard } from "../libs/clipboard";

const CopyablePre: Component<{
  content: string;
}> = (props) => {
  return (
    <div class="parent relative rounded-2 bg-secondary px-2 py-1">
      <button
        class="parent-hover:op-100 op-0 b-1 c-secondary absolute top-1 right-1 appearance-none rounded-2 bg-transparent p-1 transition-opacity duration-100 active:bg-alpha-active not-active:enabled:hover:bg-alpha-hover"
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
