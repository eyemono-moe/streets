import type { ColumnDef } from "@streets/core/deck/deck";
import {
  columnForNaddr,
  columnForNoteRef,
} from "@streets/core/deck/open-event";
import {
  formatEventAddress,
  addressOfNaddr,
} from "@streets/core/nostr/address";
import type { EventRef } from "@streets/core/nostr/event-refs";
import { kindLabel } from "@streets/core/nostr/kind-support";
import type { Nip19Ref } from "@streets/core/nostr/nip19";
import { type Component, Match, Switch } from "solid-js";
import { useDispatch } from "../ui-events";
import AvatarImage from "../ui/Avatar";
import Name from "./Name";
import { useEvent } from "./use-event";
import { useProfile } from "./use-profile";

const buttonClass =
  "bg-transparent p-0 text-left enabled:cursor-pointer enabled:hover:underline";

const frameClass =
  "inline-flex max-w-full min-w-0 items-stretch gap-1.5 rounded-r-1 bg-quote py-px pr-1.5 pl-0 align-bottom enabled:cursor-pointer enabled:hover:bg-quote-hover focus-visible:ring-2 focus-visible:ring-accent-5 border-0 text-left";

const Line: Component<{ muted?: boolean }> = (props) => (
  <span
    class="w-0.5 shrink-0 rounded-[1px]"
    classList={{
      "bg-accent-5": !props.muted,
      "bg-ui-2 dark:bg-ui-7": props.muted,
    }}
    aria-hidden="true"
  />
);

const Icon: Component = () => (
  <span
    class="i-material-symbols:format-quote-rounded size-3.25 shrink-0 self-center c-secondary"
    aria-hidden="true"
  />
);

type Quoted = { pubkey: string; kind: number };

/**
 * 本文の中にある note / nevent / naddr の参照を、「○○さんの<種類>」の 1 行にする。
 * 中身は出さない。投稿を丸ごと描くカード（`EventRefView`）は 1 行に収まらず、
 * 本文の先頭を足すと種類ごとに「先頭」の意味が変わるため。
 * 種類のアイコンを kind ごとに変えないのは、変えるには kind で分岐する表を UI に
 * 新しく置くことになるため。
 */
const QuoteChip: Component<{
  ref: Extract<Nip19Ref, { kind: "note" | "nevent" | "naddr" }>;
  raw: string;
  short: string;
}> = (props) => {
  const dispatch = useDispatch();
  const target = (): EventRef => {
    const ref = props.ref;
    if (ref.kind === "naddr") {
      const address = addressOfNaddr(ref);
      // 住所にできないものは、取りにいかず「見つからない」に落とす。
      return {
        form: "address",
        address: address ? formatEventAddress(address) : "",
      };
    }
    return {
      form: "id",
      id: ref.id,
      ...(ref.kind === "nevent" && ref.author ? { pubkey: ref.author } : {}),
    };
  };
  const lookup = useEvent(target);
  // 参照が運んでいる作者と種類。取得を待たずに出せる。
  const carried = (): Quoted | undefined => {
    const ref = props.ref;
    if (ref.kind === "naddr") {
      return { pubkey: ref.pubkey, kind: ref.eventKind };
    }
    if (ref.kind === "nevent" && ref.author && ref.eventKind !== undefined) {
      return { pubkey: ref.author, kind: ref.eventKind };
    }
    return undefined;
  };
  const quoted = (): Quoted | undefined => {
    const current = lookup();
    if (current.phase === "found") {
      return { pubkey: current.event.pubkey, kind: current.event.kind };
    }
    return carried();
  };
  const column = (): ColumnDef | undefined =>
    props.ref.kind === "naddr"
      ? columnForNaddr(props.ref)
      : columnForNoteRef(props.ref);
  const open = () => {
    const def = column();
    if (def) dispatch({ type: "stack/open", column: def });
  };

  return (
    <Switch>
      <Match when={lookup().phase === "missing"}>
        <button
          type="button"
          class={`${buttonClass} text-link`}
          title={props.raw}
          onClick={open}
        >
          {props.short}
        </button>
      </Match>
      <Match when={quoted()}>
        {(info) => {
          const profile = useProfile(() => info().pubkey);
          return (
            <button
              type="button"
              title={props.raw}
              class={frameClass}
              onClick={open}
            >
              <Line />
              <Icon />
              <AvatarImage
                pubkey={info().pubkey}
                picture={profile()?.picture}
                class="size-3.5 self-center rounded-full"
              />
              <span class="min-w-0 shrink self-center truncate font-700 c-primary">
                <Name pubkey={info().pubkey} />
              </span>
              <span class="shrink-0 self-center whitespace-nowrap c-secondary">
                さんの{kindLabel(info().kind)}
              </span>
            </button>
          );
        }}
      </Match>
      <Match when={true}>
        {/* 取得中は失敗に見せない。棒が動いているうちは読み込み中。 */}
        <button
          type="button"
          title={props.raw}
          class={frameClass}
          aria-busy="true"
          onClick={open}
        >
          <Line />
          <Icon />
          <span
            class="h-2.5 w-24 shrink-0 self-center animate-pulse rounded-full bg-tertiary"
            aria-hidden="true"
          />
        </button>
      </Match>
    </Switch>
  );
};

export default QuoteChip;
