import type { NappletHost } from "@streets/core/napplet/session";
import { prepareNappletSrcdoc } from "@streets/core/napplet/srcdoc";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createStoryAuthor } from "../storybook/story-events";
import NappletFrame from "./NappletFrame";
import NappletView, { type NappletPhase } from "./NappletView";
import { STREETS_NAPPLET_DOMAINS } from "./streets-host";
import { currentNappletTheme } from "./theme-colors";

const author = createStoryAuthor(510, { name: "アップレットの作者" });
const notes = [1, 2, 3].map((index) =>
  author.note(`アップレットの中に流れる投稿 ${index}`),
);

/**
 * 見本の napplet。`window.napplet` だけを使い、リレー・保存・テーマ・自分の情報を
 * Streets から受け取る。外へは通信しない（CSP で止めてある）。
 */
const SAMPLE_NAPPLET = `<!doctype html>
<html><head><title>見本</title><style>
  body { margin: 0; padding: 12px; font: 13px/1.5 system-ui; background: var(--bg); color: var(--fg); }
  button { background: var(--primary); color: #fff; border: 0; border-radius: 6px; padding: 4px 10px; }
  li { margin: 4px 0; }
</style></head><body>
<p>あなた: <code id="me">…</code></p>
<p><button id="count">押した回数: …</button></p>
<ul id="notes"></ul>
<script>
  const n = window.napplet;
  const paint = (theme) => {
    const s = document.body.style;
    s.setProperty("--bg", theme.colors.background);
    s.setProperty("--fg", theme.colors.text);
    s.setProperty("--primary", theme.colors.primary);
  };
  n.theme.get().then(paint);
  n.theme.onChanged(paint);
  n.identity.getPublicKey().then((pk) => { me.textContent = pk ? pk.slice(0, 12) + "…" : "ログインしていません"; });
  const show = async () => { count.textContent = "押した回数: " + ((await n.storage.getItem("count")) ?? "0"); };
  count.onclick = async () => {
    const next = Number((await n.storage.getItem("count")) ?? "0") + 1;
    await n.storage.setItem("count", String(next));
    show();
  };
  show();
  n.relay.subscribe({ kinds: [1], limit: 20 }, ({ event }) => {
    const li = document.createElement("li");
    li.textContent = event.content;
    notes.append(li);
  }, () => {});
</script></body></html>`;

const storyHost = (): NappletHost => {
  const stored = new Map<string, string>();
  return {
    domains: STREETS_NAPPLET_DOMAINS,
    publicKey: () => author.pubkey,
    relays: () => ({}),
    profile: async () => ({ name: "アップレットの作者" }),
    follows: async () => [],
    mutes: async () => [],
    theme: () => currentNappletTheme(document.body),
    storage: {
      get: (scope, key) => stored.get(`${scope}/${key}`) ?? null,
      set: (scope, key, value) => void stored.set(`${scope}/${key}`, value),
      remove: (scope, key) => void stored.delete(`${scope}/${key}`),
      keys: () => [...stored.keys()],
    },
    writeRelays: () => undefined,
    inc: { emit: () => {} },
    intent: {
      invoke: async () => ({ ok: false, error: "no handler" }),
      available: (archetype) => ({
        archetype,
        available: false,
        candidates: [],
        hasDefault: false,
      }),
      handlers: () => [],
    },
    fetchResource: async () => ({ ok: false, error: "not-found" }),
    subscribe: (_, sink) => {
      for (const note of notes) sink.event(note);
      sink.eose();
      return () => {};
    },
  };
};

type Props = {
  state: NappletPhase;
  unsupported: string[];
  /** カラムの幅（px）。 */
  width: number;
};

const ViewStory: Component<Props> = (props) => (
  <div
    class="h-80 border border-primary bg-primary"
    style={{ width: `${props.width}px` }}
  >
    <NappletView
      state={props.state}
      unsupported={props.unsupported}
      frame={
        props.state.phase === "ready" ? (
          <NappletFrame
            html={prepareNappletSrcdoc(SAMPLE_NAPPLET, STREETS_NAPPLET_DOMAINS)}
            title="見本"
            host={storyHost()}
            viewer={author.pubkey}
          />
        ) : undefined
      }
    />
  </div>
);

const meta = {
  title: "カラム/アップレット",
  component: ViewStory,
  args: { state: { phase: "ready" }, unsupported: [], width: 360 },
  argTypes: { state: { control: false } },
} satisfies Meta<typeof ViewStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 見本の napplet が、Streets のテーマ・保存・購読を使って動く。 */
export const 動いている: Story = {};

export const 渡せない機能がある: Story = {
  args: { unsupported: ["intent", "upload"] },
};

export const 情報を取得中: Story = {
  args: { state: { phase: "manifest-loading" } },
};

export const 本体を取得中: Story = {
  args: { state: { phase: "artifact-loading" } },
};

export const 見つからない: Story = {
  args: { state: { phase: "manifest-missing" } },
};

/** 2026-10 より前の形で、index.html 以外のファイルも持つもの。 */
export const 古い形式で複数のファイル: Story = {
  args: { state: { phase: "manifest-invalid", error: "legacy-multi-file" } },
};

export const マニフェストが壊れている: Story = {
  args: { state: { phase: "manifest-invalid", error: "multiple-hashes" } },
};

export const 本体が一致しない: Story = {
  args: { state: { phase: "artifact-failed", error: "hash-mismatch" } },
};

export const 本体を取れない: Story = {
  args: { state: { phase: "artifact-failed", error: "unavailable" } },
};

export const 狭いカラム: Story = {
  args: { width: 240, unsupported: ["intent"] },
};
