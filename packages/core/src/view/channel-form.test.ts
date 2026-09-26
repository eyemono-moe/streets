import { describe, expect, it } from "vite-plus/test";
import type { Channel } from "../nostr/channel";
import type { RelayUrl } from "../relay/relay-connection";
import {
  canSubmitChannelForm,
  channelFormTransition,
  closedChannelForm,
  isChannelFormDirty,
} from "./channel-form";

const RELAY = "wss://yabu.me/" as RelayUrl;
const run = (...events: Parameters<typeof channelFormTransition>[1][]) =>
  events.reduce(channelFormTransition, closedChannelForm());

const channel: Channel = {
  id: "1".repeat(64),
  creator: "c".repeat(64),
  metadata: { name: "部屋", about: "説明", relays: [RELAY] },
  updatedAt: 0,
};

describe("channelFormTransition", () => {
  it("作るときは名前とリレーがそろうまで送れない", () => {
    const opened = run({ type: "channel-form/open-create", relays: [] });
    expect(canSubmitChannelForm(opened)).toBe(false);
    const named = channelFormTransition(opened, {
      type: "channel-form/input",
      field: "name",
      value: "部屋",
    });
    // 捕まえる変異: リレー 0 本でも送れる（誰も読めないチャンネルができる）
    expect(canSubmitChannelForm(named)).toBe(false);
    const ready = channelFormTransition(named, {
      type: "channel-form/relays",
      relays: [RELAY],
    });
    expect(canSubmitChannelForm(ready)).toBe(true);
    expect(
      channelFormTransition(ready, { type: "channel-form/submit" }),
    ).toMatchObject({
      phase: "saving",
    });
  });

  it("書きかけのまま閉じようとしても閉じず、やめれば閉じる", () => {
    const dirty = run(
      { type: "channel-form/open-create", relays: [RELAY] },
      { type: "channel-form/input", field: "name", value: "書きかけ" },
    );
    const blocked = channelFormTransition(dirty, {
      type: "channel-form/close",
    });
    // 捕まえる変異: 書きかけを黙って捨てて閉じる
    expect(blocked).toMatchObject({ phase: "editing", blocked: true });
    expect(
      channelFormTransition(blocked, { type: "channel-form/discard" }),
    ).toEqual(closedChannelForm());
  });

  it("何も変えていなければそのまま閉じる", () => {
    const opened = run({ type: "channel-form/open-edit", channel });
    expect(isChannelFormDirty(opened)).toBe(false);
    expect(
      channelFormTransition(opened, { type: "channel-form/close" }),
    ).toEqual(closedChannelForm());
  });

  it("直すときは、何か変えるまで送れない", () => {
    const opened = run({ type: "channel-form/open-edit", channel });
    expect(opened).toMatchObject({
      mode: "edit",
      channelId: channel.id,
      favorite: false,
    });
    expect(canSubmitChannelForm(opened)).toBe(false);
    expect(
      canSubmitChannelForm(
        channelFormTransition(opened, {
          type: "channel-form/input",
          field: "about",
          value: "新しい説明",
        }),
      ),
    ).toBe(true);
  });

  it("送れなかったら書きかけを残して、送り直せるようにする", () => {
    const saving = run(
      { type: "channel-form/open-create", relays: [RELAY] },
      { type: "channel-form/input", field: "name", value: "部屋" },
      { type: "channel-form/submit" },
    );
    const failed = channelFormTransition(saving, {
      type: "channel-form/failed",
    });
    expect(failed).toMatchObject({ phase: "editing", draft: { name: "部屋" } });
  });

  it("送っている間は入力も閉じるも受け付けない", () => {
    const saving = run(
      { type: "channel-form/open-create", relays: [RELAY] },
      { type: "channel-form/input", field: "name", value: "部屋" },
      { type: "channel-form/submit" },
    );
    expect(
      channelFormTransition(saving, { type: "channel-form/discard" }),
    ).toBe(saving);
  });

  it("開いたときの中身を、書き換えても変えない", () => {
    // 捕まえる変異: initial と draft で同じ配列を共有する（リレーを足すと initial も変わり、書きかけと分からない）
    const opened = run({ type: "channel-form/open-edit", channel });
    const changed = channelFormTransition(opened, {
      type: "channel-form/relays",
      relays: [RELAY, "wss://nos.lol/" as RelayUrl],
    });
    expect(isChannelFormDirty(changed)).toBe(true);
  });
});
