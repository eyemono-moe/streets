import type { ColumnDef } from "@streets/core/deck/deck";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import ColumnSettingsPanel from "./ColumnSettingsPanel";

const relayColumn: ColumnDef = {
  id: "relay",
  title: "リレー（3）",
  source: {
    kind: "literal",
    filters: [{ kinds: [1] }],
    relays: [
      "wss://relay.example/",
      "wss://inbox.example/",
      "wss://outbox.example/",
    ],
  },
};

const meta = {
  title: "デッキ/カラム設定パネル",
  component: () => (
    <Mediates handle={() => true}>
      <div class="h-150 w-95">
        <ColumnSettingsPanel
          column={relayColumn}
          relayList={{
            phase: "ready",
            entries: [
              { url: "wss://relay.example/", read: true, write: true },
              { url: "wss://inbox.example/", read: true, write: false },
              { url: "wss://outbox.example/", read: false, write: true },
            ],
          }}
        />
      </div>
    </Mediates>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const リレーカラム: Story = {};
