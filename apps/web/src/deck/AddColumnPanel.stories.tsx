import type { RelayListState } from "@streets/core/settings/relay-list-state";
import type { ComponentProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import AddColumnPanel, { UserSearchStatus } from "./AddColumnPanel";

type Props = {
  relayList: RelayListState;
  initialPicker?: ComponentProps<typeof AddColumnPanel>["initialPicker"];
};

const meta = {
  title: "デッキ/カラム追加",
  component: (props: Props) => (
    <Mediates handle={() => true}>
      <div class="flex h-150 w-95 flex-col bg-primary pt-3">
        <AddColumnPanel
          relayList={props.relayList}
          initialPicker={props.initialPicker}
          searchRelays={() => []}
        />
      </div>
    </Mediates>
  ),
  args: {
    relayList: {
      phase: "ready",
      entries: [
        { url: "wss://relay.example/", read: true, write: true },
        { url: "wss://inbox.example/", read: true, write: false },
        { url: "wss://outbox.example/", read: false, write: true },
      ],
    },
    initialPicker: "relay",
  },
  argTypes: {
    relayList: { control: false },
    initialPicker: { control: false },
  },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 開いた直後。カラムの種類を選ぶところ。 */
export const カラムの種類: Story = { args: { initialPicker: undefined } };

export const リレー設定あり: Story = {};

export const 読み込み中: Story = {
  args: { relayList: { phase: "loading" } },
};

export const リレー設定なし: Story = {
  args: { relayList: { phase: "missing" } },
};

/**
 * チャンネルを選ぶところ。一覧は読み取り層に繋がるのでここには出さない。
 * 一覧の見た目は「チャット/チャンネルの一覧」で見る。
 */
export const チャンネルを選ぶ: Story = {
  args: { initialPicker: "channels" },
};

/**
 * リストを選ぶところ。一覧は読み取り層に繋がるのでここには出さない。
 * 一覧の見た目は「リスト/一覧」で見る。
 */
export const リストを選ぶ: Story = {
  args: { initialPicker: "follow-sets" },
};

/** ユーザーを選ぶところ。読み取り層が無いので、名前の補完は出ない。 */
export const ユーザーを選ぶ: Story = {
  args: { initialPicker: "user" },
};

/**
 * 名前で探したときの、検索リレーへの問い合わせの進み具合。見つかった人は
 * 入力欄の補完に、フォロー中の人の後ろへ並ぶ。
 */
export const ユーザー検索の進み具合: Story = {
  render: () => (
    <div class="flex w-95 flex-col gap-3 bg-primary p-3">
      <UserSearchStatus searching found={undefined} />
      <UserSearchStatus searching={false} found={3} />
      <UserSearchStatus searching={false} found={0} />
    </div>
  ),
};
