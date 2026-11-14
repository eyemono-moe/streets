import {
  type ListRequest,
  applyListMutation,
} from "@streets/core/napplet/lists";
import type { NappletHost } from "@streets/core/napplet/session";
import { For, Show } from "solid-js";
import Name from "../note/Name";
import type { AppletWriter } from "./applet-writer";
import type { ActionPrompt } from "./common-host";

const ITEMS_SHOWN = 6;

class ListNotFoundError extends Error {}

const Items = (props: { tags: readonly string[][] }) => (
  <ul class="flex flex-col gap-0.5">
    <For each={props.tags.slice(0, ITEMS_SHOWN)}>
      {(tag) => (
        <li class="c-primary min-w-0 truncate text-body">
          <Show when={tag[0] === "p"} fallback={tag[1]}>
            <Name pubkey={tag[1] ?? ""} />
          </Show>
          <Show when={tag[2]}>
            {(marker) => (
              <span class="c-secondary text-caption">
                （{marker() === "read" ? "読み込み" : "書き込み"}）
              </span>
            )}
          </Show>
        </li>
      )}
    </For>
    <Show when={props.tags.length > ITEMS_SHOWN}>
      <li class="c-secondary text-caption">
        ほか {props.tags.length - ITEMS_SHOWN} 件
      </li>
    </Show>
  </ul>
);

/**
 * NAP-LISTS。確かめてから、いまの版を読んで項目を足す・外し、Streets の書き手で書く
 * （進み具合のトーストも同じものが出る）。
 */
export const createListsHost = (options: {
  writer: AppletWriter | undefined;
  confirm: (prompt: ActionPrompt) => Promise<boolean>;
  label: string;
}): NappletHost["lists"] => ({
  mutate: async (request: ListRequest, operation) => {
    const writer = options.writer;
    if (!writer) return { ok: false, error: "not-signed-in" };
    const name = request.identifier
      ? `${request.entry.label}「${request.title ?? request.identifier}」`
      : `「${request.entry.label}」`;
    const approved = await options.confirm({
      title:
        operation === "add"
          ? `${name}に ${request.tags.length} 件足そうとしています`
          : `${name}から ${request.tags.length} 件外そうとしています`,
      body: () => <Items tags={request.tags} />,
      confirmLabel: operation === "add" ? "足す" : "外す",
    });
    if (!approved) return { ok: false, error: "user-denied" };
    let counts = { changed: 0, skipped: 0 };
    try {
      const result = await writer.replace(
        request.entry.kind,
        request.identifier,
        (current) => {
          // > With `create: true`, MAY create a missing list.
          if (!current && request.identifier && !request.create) {
            throw new ListNotFoundError();
          }
          const applied = applyListMutation(current, request, operation);
          counts = applied;
          return applied.draft;
        },
        options.label,
      );
      return { ok: true, eventId: result.event.id, ...counts };
    } catch (cause) {
      return {
        ok: false,
        error:
          cause instanceof ListNotFoundError
            ? "list-not-found"
            : "publish-failed",
      };
    }
  },
});
