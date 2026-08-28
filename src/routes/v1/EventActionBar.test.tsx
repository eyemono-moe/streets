import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import {
  type EventScene,
  EventSceneProvider,
} from "../../storybook/EventScene";
import { createStoryAuthor } from "../../storybook/story-events";
import EventView from "./EventView";
import { type EventActions, EventActionsProvider } from "./event-actions";
import { ThreadNavProvider } from "./thread-nav";

const alice = createStoryAuthor(81);
const bob = createStoryAuthor(82);
const note = bob.note("action target");
const profiles = [alice.profile(), bob.profile()];

const scene = (...events: readonly NostrEvent[]): EventScene => ({
  events: [...profiles, ...events],
  viewerPubkey: alice.pubkey,
});

const actionsWith = (overrides: Partial<EventActions> = {}): EventActions => ({
  async reply() {},
  async repost() {},
  async like() {},
  ...overrides,
});

const mount = (
  event: NostrEvent,
  value: EventActions | undefined,
  currentScene: EventScene,
  open: (id: string) => void = () => {},
  onBubble?: () => void,
) => {
  let element: HTMLElement | undefined;
  let disposeRoot = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    EventSceneProvider({
      scene: currentScene,
      get children() {
        const render = () => {
          let rendered: unknown = EventView({
            id: event.id,
            variant: "full",
          });
          while (typeof rendered === "function") {
            rendered = (rendered as () => unknown)();
          }
          element = (
            Array.isArray(rendered)
              ? rendered.find((item) => item instanceof HTMLElement)
              : rendered
          ) as HTMLElement;
          return null;
        };
        const renderWithNav = () =>
          ThreadNavProvider({
            open,
            get children() {
              return render();
            },
          });
        if (value) {
          EventActionsProvider({
            value,
            get children() {
              return renderWithNav();
            },
          });
        } else {
          renderWithNav();
        }
        return null;
      },
    });
  });
  const mounted = element;
  if (!mounted) throw new Error("EventView did not mount");
  const root = onBubble
    ? ((
        <div onClick={onBubble} onKeyDown={onBubble}>
          {mounted}
        </div>
      ) as HTMLElement)
    : mounted;
  document.body.appendChild(root);
  return {
    element: root,
    dispose() {
      root.remove();
      disposeRoot();
    },
  };
};

describe("EventActionBar", () => {
  it("直接返信・リポスト・Like件数とviewerの送信済み状態を出す", () => {
    const directReply = alice.reply("reply", { parent: note });
    const repost = alice.repost(note);
    const like = alice.reaction(note, { type: "like" });
    const { element, dispose } = mount(
      note,
      actionsWith(),
      scene(note, directReply, repost, like),
    );
    try {
      expect(
        element.querySelector('[data-testid="event-reply"]')?.textContent,
      ).toContain("1");
      const repostButton = element.querySelector<HTMLButtonElement>(
        '[data-testid="event-repost"]',
      );
      const likeButton = element.querySelector<HTMLButtonElement>(
        '[data-testid="event-like"]',
      );
      // 捕まえる変異: viewer pubkey を集計へ渡さず、自分が送信済みでも
      // ボタンを有効なままにする。同じイベントを連打で再送できてしまう。
      expect(repostButton?.disabled).toBe(true);
      expect(repostButton?.textContent).toContain("1");
      expect(likeButton?.disabled).toBe(true);
      expect(likeButton?.textContent).toContain("1");
    } finally {
      dispose();
    }
  });

  it("アクションのクリックをノートへ伝播させない", () => {
    const like = vi.fn(async () => {});
    const opened: string[] = [];
    const propagated = vi.fn();
    const { element, dispose } = mount(
      note,
      actionsWith({ like }),
      scene(note),
      (id) => opened.push(id),
      propagated,
    );
    try {
      element
        .querySelector<HTMLButtonElement>('[data-testid="event-like"]')
        ?.click();
      // 捕まえる変異: Like ボタンの stopPropagation を落とす。Like と同時に
      // EventActionBar の外側にあるクリック処理まで実行される。
      expect(propagated).not.toHaveBeenCalled();
      expect(opened).toEqual([]);
      expect(like).toHaveBeenCalledWith(note);
    } finally {
      dispose();
    }
  });

  it("返信失敗時はダイアログと入力を残して再試行できる", async () => {
    const reply = vi.fn(async () => {
      throw new Error("relay down");
    });
    const { element, dispose } = mount(
      note,
      actionsWith({ reply }),
      scene(note),
    );
    try {
      element
        .querySelector<HTMLButtonElement>('[data-testid="event-reply"]')
        ?.click();
      const input = document.body.querySelector<HTMLTextAreaElement>(
        '[data-testid="reply-input"]',
      );
      expect(input).not.toBeNull();
      if (!input) return;
      input.value = "  retry me  ";
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      document.body
        .querySelector<HTMLButtonElement>('[data-testid="reply-submit"]')
        ?.click();

      await vi.waitFor(() => {
        expect(
          document.body.querySelector('[data-testid="reply-error"]')
            ?.textContent,
        ).toContain("relay down");
      });
      // 捕まえる変異: catch で content を空にする。送れなかった返信を
      // ユーザーが最初から打ち直すことになる。
      expect(input.value).toBe("  retry me  ");
      expect(reply).toHaveBeenCalledWith(note, "retry me");
    } finally {
      dispose();
    }
  });

  it("Providerが無いときとkind:7通知内の対象ではアクションを出さない", () => {
    const withoutProvider = mount(note, undefined, scene(note));
    const notification = alice.reaction(note, { type: "like" });
    const notificationView = mount(
      notification,
      actionsWith(),
      scene(note, notification),
    );
    try {
      expect(
        withoutProvider.element.querySelector('[data-testid="event-actions"]'),
      ).toBeNull();
      // 捕まえる変異: ReactionFull から hideActions を落とす。通知カード内の
      // 対象ノートに本文向けアクション列が現れる。
      expect(
        notificationView.element.querySelector('[data-testid="event-actions"]'),
      ).toBeNull();
    } finally {
      withoutProvider.dispose();
      notificationView.dispose();
    }
  });
});
