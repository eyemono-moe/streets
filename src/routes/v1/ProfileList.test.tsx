import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import type { EngagementRequests } from "../../core/read/engagement-requests";
import type { EventRequests } from "../../core/read/event-requests";
import type { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import {
  type RenderContextValue,
  RenderProvider,
} from "../../core/view/render-context";
import ProfileList from "./ProfileList";
import { type FollowState, FollowStateProvider } from "./follow-state";

const TARGET = "a".repeat(64);
const VIEWER = "b".repeat(64);

const noOpRequests = () => ({
  request() {},
  isUnresolved() {
    return false;
  },
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const mountProfile = (profile: {
  name: string;
  display_name: string;
  about: string;
}) => {
  const metadata: NostrEvent = {
    id: "c".repeat(64),
    pubkey: TARGET,
    created_at: 1,
    kind: 0,
    tags: [],
    content: JSON.stringify(profile),
    sig: "d".repeat(128),
  };
  const store = {
    latestReplaceable: () => metadata,
    onReplaceableChanged: () => () => {},
  } as unknown as EventStore;
  const follower = { ...metadata, id: "e".repeat(64), kind: 3 };
  const requests = noOpRequests();
  const render: RenderContextValue = {
    store,
    events: requests as EventRequests,
    profiles: requests as ProfileRequests,
    engagements: requests as EngagementRequests,
    viewerPubkey: VIEWER,
    renderers: [],
  };
  const followState: FollowState = {
    viewer: VIEWER,
    followees: () => [],
    isFollowing: () => false,
    isSaving: () => false,
    error: () => undefined,
    follow: async () => {},
    unfollow: async () => {},
    retry: async () => {},
  };
  let element: HTMLElement | undefined;
  let disposeRoot = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: render,
      get children() {
        return FollowStateProvider({
          value: followState,
          get children() {
            element = ProfileList({
              kind: "followers-list",
              items: () => [follower],
              status: () => ({ phase: "settled" }),
            }) as unknown as HTMLElement;
            return null;
          },
        });
      },
    });
  });
  if (!element) throw new Error("ProfileList did not mount");
  return { element, dispose: disposeRoot };
};

const mountEmpty = (status: Parameters<typeof ProfileList>[0]["status"]) => {
  let element: HTMLElement | undefined;
  createRoot((dispose) => {
    element = ProfileList({
      kind: "followers-list",
      items: () => [],
      status,
    }) as unknown as HTMLElement;
    dispose();
  });
  if (!element) throw new Error("ProfileList did not mount");
  return element;
};

describe("ProfileList", () => {
  it("取得が完了した空一覧だけを0人と断定する", () => {
    // 捕まえる変異: settled を見ず、取得中から0人と表示する。
    expect(mountEmpty(() => ({ phase: "settled" })).textContent).toContain(
      "該当するユーザーはいません。",
    );
    expect(mountEmpty(() => ({ phase: "initial" })).textContent).not.toContain(
      "該当するユーザーはいません。",
    );
  });

  it("不完全取得を0人と断定せず、開き直す手段を示す", () => {
    // 捕まえる変異: incomplete を無視して settled の空表示へ落とす。
    const element = mountEmpty(() => ({
      phase: "settled",
      incomplete: {
        unreachableRelays: 1,
        unroutableAuthors: 0,
        uncoveredAuthors: 0,
      },
    }));
    expect(element.textContent).toContain("一覧を取得できませんでした");
    expect(element.textContent).toContain("カラムを開き直してください");
    expect(element.textContent).not.toContain("該当するユーザーはいません。");
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("長い display_name と name をボタンの手前でそれぞれ省略する", () => {
    // 捕まえる変異: 一覧でもイベント著者用の折り返し表示を使う、または
    // フォローボタンを名前と同じ行から外す。
    const displayName = "とても長い表示名".repeat(10);
    const name = "very-long-handle-".repeat(10);
    const { element, dispose } = mountProfile({
      display_name: displayName,
      name,
      about: "自己紹介",
    });
    try {
      const profileName = element.querySelector<HTMLElement>(
        '[data-testid="profile-name"]',
      );
      const handle = element.querySelector<HTMLElement>(
        '[data-testid="profile-handle"]',
      );
      const rowContent = element.querySelector<HTMLElement>(
        '[data-testid="profile-row-content"]',
      );
      const followButton = element.querySelector<HTMLElement>(
        '[data-testid="follow-button"]',
      );
      expect(profileName?.classList).toContain("truncate");
      expect(profileName?.title).toBe(displayName);
      expect(handle?.classList).toContain("truncate");
      expect(handle?.title).toBe(`@${name}`);
      expect(
        rowContent?.firstElementChild?.contains(followButton ?? null),
      ).toBe(true);
      expect(followButton?.parentElement?.classList).toContain("shrink-0");
    } finally {
      dispose();
    }
  });

  it("長いbioでもアイコンを40px角に保ち、bioを最大5行に制限する", () => {
    // 捕まえる変異: アバターの高さを固定しない、またはbioを3行で省略する。
    const about = "長い自己紹介です。".repeat(30);
    const { element, dispose } = mountProfile({
      display_name: "表示名",
      name: "handle",
      about,
    });
    try {
      const avatar = element.querySelector<HTMLElement>(
        '[data-testid="avatar"]',
      );
      const profileAbout = element.querySelector<HTMLElement>(
        '[data-testid="profile-about"]',
      );
      expect(avatar?.classList).toContain("h-10");
      expect(avatar?.classList).toContain("w-10");
      expect(avatar?.classList).toContain("shrink-0");
      expect(profileAbout?.classList).toContain("line-clamp-5");
      expect(profileAbout?.textContent).toBe(about);
    } finally {
      dispose();
    }
  });
});
