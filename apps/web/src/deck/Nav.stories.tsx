import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import { MobileTopBar, Sidebar } from "./Nav";

const Demo = (props: { mobile: boolean }) => (
  <EventSceneProvider scene={{ events: [] }}>
    <Mediates handle={() => true}>
      <div
        class="h-[640px] bg-primary"
        style={{ width: props.mobile ? "390px" : "900px" }}
      >
        {props.mobile ? (
          <MobileTopBar
            pubkey={undefined}
            column={undefined}
            temporary={false}
            settingsOpen={false}
            onLogout={() => undefined}
          />
        ) : (
          <Sidebar
            pubkey={undefined}
            columns={[]}
            panel={undefined}
            numbers
            onLogout={() => undefined}
          />
        )}
      </div>
    </Mediates>
  </EventSceneProvider>
);

const meta = {
  title: "デッキ/ナビゲーション",
  component: Demo,
  args: { mobile: false },
} satisfies Meta<typeof Demo>;

export default meta;
type S = StoryObj<typeof meta>;

export const 広い画面: S = {};
export const 狭い画面: S = { args: { mobile: true } };
