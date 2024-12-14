import { noteEncode, npubEncode } from "nostr-tools/nip19";
import { type Component, type ComponentProps, onMount } from "solid-js";

const waitNostrZap = async () => {
  // window.nostrZapが定義されるまで待つ
  const maxWait = 10000;

  let waited = 0;
  while (!window.nostrZap && waited < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    waited += 100;
  }
};

const ZapButton: Component<
  ComponentProps<"button"> & {
    pubkey: string;
    noteId?: string;
  }
> = (props) => {
  let ref: HTMLButtonElement | undefined;

  onMount(() => {
    waitNostrZap().then(() => {
      if (ref) {
        window.nostrZap?.initTarget(ref);
      }
    });
  });

  return (
    <button
      {...props}
      ref={ref}
      type="button"
      {...(props.noteId && {
        "data-note-id": noteEncode(props.noteId),
      })}
      data-npub={npubEncode(props.pubkey)}
    >
      {props.children}
    </button>
  );
};

export default ZapButton;

declare global {
  interface Window {
    nostrZap?: {
      initTarget: (target: HTMLElement) => void;
    };
  }
}
