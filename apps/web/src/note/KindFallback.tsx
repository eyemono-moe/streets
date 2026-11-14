import { altText } from "@streets/core/nostr/alt";
import type { NostrEvent } from "@streets/core/nostr/event";
import { type Component, Show } from "solid-js";
import { t } from "../i18n/locale";
import type { EventSize } from "./Event";
import { isNamedKind } from "./event-kinds";

/** NIP-90 の処理の依頼と結果は、番号の幅で決まる。 */
const kindName = (kind: number): string | undefined => {
  if (isNamedKind(kind)) return t(`note.kindName.${kind}`);
  if (kind >= 5000 && kind < 6000) return t("note.kindName.jobRequest");
  if (kind >= 6000 && kind < 7000) return t("note.kindName.jobResult");
  if (kind === 7000) return t("note.kindName.jobFeedback");
  return undefined;
};

/**
 * 専用の描き方が無い kind。何の kind かと、作った人が書いた説明（NIP-31 の `alt`）を出す。
 * 本文は出さない —— kind によって JSON や暗号文が入っていて、読める文とは限らない。
 */
const KindFallback: Component<{ event: NostrEvent; size: EventSize }> = (
  props,
) => {
  const name = () => kindName(props.event.kind);
  return (
    <div
      class="flex min-w-0 flex-col gap-1"
      classList={{
        "rounded-2 border border-primary px-3 py-2.5": props.size === "normal",
      }}
    >
      <span class="c-secondary flex items-center gap-1 text-caption">
        <span
          class="i-material-symbols:extension-outline-rounded size-3.5 shrink-0"
          aria-hidden="true"
        />
        <span class="min-w-0 break-words">
          <Show
            when={name()}
            fallback={t("note.kindFallback.numbered", {
              kind: props.event.kind,
            })}
          >
            {(name) =>
              t("note.kindFallback.named", {
                name: name(),
                kind: props.event.kind,
              })
            }
          </Show>
        </span>
      </span>
      <Show
        when={altText(props.event)}
        fallback={
          <span class="c-secondary text-caption">
            {t("note.kindFallback.noDescription")}
          </span>
        }
      >
        {(alt) => (
          <p
            class="c-primary line-clamp-4 break-words"
            classList={{
              "text-body": props.size === "normal",
              "text-[14px]": props.size === "compact",
            }}
          >
            {alt()}
          </p>
        )}
      </Show>
    </div>
  );
};

export default KindFallback;
