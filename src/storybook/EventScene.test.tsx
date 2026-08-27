import { type Accessor, createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import EventView from "../routes/v1/EventView";
import { useOptionalMuteList } from "../routes/v1/mute-list";
import { EventSceneProvider } from "./EventScene";
import { createStoryAuthor } from "./story-events";

const mount = (
  scene:
    | Parameters<typeof EventSceneProvider>[0]["scene"]
    | Accessor<Parameters<typeof EventSceneProvider>[0]["scene"]>,
  render: () => HTMLElement,
): { element: () => HTMLElement; dispose: () => void } => {
  let element: HTMLElement | undefined;
  let disposeRoot = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    EventSceneProvider({
      get scene() {
        return typeof scene === "function" ? scene() : scene;
      },
      get children() {
        element = render();
        return null;
      },
    });
  });
  return {
    element: () => {
      if (!element) throw new Error("Story component did not mount");
      return element;
    },
    dispose: disposeRoot,
  };
};

describe("EventSceneProvider", () => {
  it("イベントを本番 Store と既定レンダラで描ける", async () => {
    const author = createStoryAuthor(101);
    const note = author.note("scene note");
    const { element, dispose } = mount(
      { events: [note] },
      () =>
        EventView({
          id: note.id,
          variant: "full",
        }) as unknown as HTMLElement,
    );
    try {
      await vi.waitFor(() => {
        // 捕まえる変異: scene.events を Store へ入れない、または
        // defaultRenderers を配線せず未知 kind の表示へ落とす。
        expect(element().querySelector('[data-testid="note"]')).not.toBeNull();
        expect(element().textContent).toContain("scene note");
      });
    } finally {
      dispose();
    }
  });

  it("unresolvedEventIds に指定した関連イベントだけ未解決へ遷移する", async () => {
    const author = createStoryAuthor(102);
    const missing = author.note("not stored");
    const { element, dispose } = mount(
      { events: [], unresolvedEventIds: [missing.id] },
      () =>
        EventView({
          id: missing.id,
          variant: "compact",
        }) as unknown as HTMLElement,
    );
    try {
      await vi.waitFor(() => {
        // 捕まえる変異: unresolvedEventIds を無視し、関連イベントを永遠に
        // loading のままにする。
        expect(
          element().querySelector('[data-testid="event-unresolved"]'),
        ).not.toBeNull();
      });
    } finally {
      dispose();
    }
  });

  it("unresolvedEventIds に無い関連イベントは読み込み中のままにする", async () => {
    const author = createStoryAuthor(104);
    const missing = author.note("still loading");
    const { element, dispose } = mount(
      { events: [] },
      () =>
        EventView({
          id: missing.id,
          variant: "compact",
        }) as unknown as HTMLElement,
    );
    try {
      await vi.waitFor(() => {
        expect(
          element().querySelector('[data-testid="event-loading"]'),
        ).not.toBeNull();
      });
      await Promise.resolve();
      await Promise.resolve();
      // 捕まえる変異: request された全 id を unresolved とみなし、明示されて
      // いない関連イベントまで「読み込めませんでした」へ遷移させる。
      expect(
        element().querySelector('[data-testid="event-loading"]'),
      ).not.toBeNull();
      expect(
        element().querySelector('[data-testid="event-unresolved"]'),
      ).toBeNull();
    } finally {
      dispose();
    }
  });

  it("scene と表示 id の更新後は新しい Store を参照する", async () => {
    const author = createStoryAuthor(105);
    const first = author.note("first scene");
    const second = author.note("second scene");
    const [scene, setScene] = createSignal({ events: [first] });
    const [id, setId] = createSignal(first.id);
    const { element, dispose } = mount(
      scene,
      () =>
        EventView({
          get id() {
            return id();
          },
          variant: "full",
        }) as unknown as HTMLElement,
    );
    try {
      await vi.waitFor(() =>
        expect(element().textContent).toContain("first scene"),
      );
      setScene({ events: [second] });
      setId(second.id);
      await vi.waitFor(() => {
        // 捕まえる変異: Context.Provider へ scene ごとの context object を直接
        // 渡し、consumer を古い Store へ束縛したままにする。
        expect(element().textContent).toContain("second scene");
        expect(
          element().querySelector('[data-testid="event-loading"]'),
        ).toBeNull();
      });
    } finally {
      dispose();
    }
  });

  it("mutes を MuteList context に閉じ込めて提供する", () => {
    const author = createStoryAuthor(103);
    const entry = {
      target: { type: "pubkey" as const, value: author.pubkey },
      visibility: "private" as const,
    };
    const note = author.note("muted");
    const { element, dispose } = mount(
      { events: [note], mutes: [entry] },
      () => {
        const muteList = useOptionalMuteList();
        const output = document.createElement("p");
        output.textContent = String(muteList?.matches(note).length ?? 0);
        return output;
      },
    );
    try {
      // 捕まえる変異: mutes を EventSceneProvider で MuteListProvider へ渡さない。
      expect(element().textContent).toBe("1");
    } finally {
      dispose();
    }
  });
});
