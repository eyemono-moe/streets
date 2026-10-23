import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type QueuedWrite,
  type WriteQueueState,
  summarizeWriteQueue,
} from "@streets/core/view/write-queue";
import type {
  RelayProgress,
  WriteProgress,
} from "@streets/core/write/write-progress";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import WriteQueueToast from "./WriteQueueToast";

type Args = { state: WriteQueueState; open?: boolean };

/** トーストの枠はアプリと同じ見た目にして、中身だけを差し替えて並べる。 */
const Story = (props: Args) => {
  const summary = summarizeWriteQueue(props.state);
  return (
    <div class="p-6">
      <div class="w-80 rounded-2 border border-primary bg-primary p-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        {summary ? (
          <WriteQueueToast
            meta={{
              summary,
              writes: summary.tone === "working" ? props.state.writes : [],
            }}
            defaultDetailsOpen={props.open}
          />
        ) : null}
      </div>
    </div>
  );
};

const relay = (
  host: string,
  state: RelayProgress["state"],
  reason?: string,
): RelayProgress => ({
  relay: `wss://${host}/` as RelayUrl,
  state,
  ...(reason ? { reason } : {}),
});

let id = 0;
const write = (
  label: string,
  progress?: WriteProgress,
  quiet = false,
): QueuedWrite => {
  id += 1;
  return {
    id: String(id),
    label,
    quiet,
    startedAt: 0,
    progress,
    returned: progress?.phase === "sending",
  };
};

const sending = (...relays: RelayProgress[]): WriteProgress => ({
  phase: "sending",
  relays,
});

const queue = (...writes: QueuedWrite[]): WriteQueueState => ({
  writes,
  saved: [],
});

const meta = {
  title: "トースト/書き込みの列",
  component: Story,
  args: {
    state: queue(
      write(
        "ステータス",
        sending(relay("yabu.me", "pending"), relay("nos.lol", "pending")),
      ),
    ),
  },
  argTypes: { state: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 一件を送信中: S = {};

/** 続けて投稿したとき、遅いリレーがあると残る。1 本には届いているので「保存しました」と出す。 */
export const 連続投稿で遅いリレーが残る: S = {
  args: {
    state: queue(
      write(
        "投稿",
        sending(
          relay("yabu.me", "accepted"),
          relay("slow.example.invalid", "pending"),
        ),
        true,
      ),
      write(
        "投稿",
        sending(
          relay("yabu.me", "accepted"),
          relay("slow.example.invalid", "pending"),
        ),
        true,
      ),
      write(
        "リアクション",
        sending(
          relay("yabu.me", "accepted"),
          relay("slow.example.invalid", "pending"),
        ),
        true,
      ),
    ),
  },
};

export const まだ届いていない書き込みがある: S = {
  args: {
    state: queue(
      write(
        "投稿",
        sending(relay("yabu.me", "accepted"), relay("nos.lol", "pending")),
        true,
      ),
      write("フォロー", { phase: "checking" }),
      write(
        "ブックマーク",
        sending(relay("yabu.me", "pending"), relay("nos.lol", "pending")),
      ),
    ),
  },
};

export const 内訳を開く: S = {
  args: {
    ...まだ届いていない書き込みがある.args,
    open: true,
  },
};

/** 断られたリレーがあっても、残りへ送っている間は列に残る。 */
export const 断ったリレーがある: S = {
  args: {
    state: queue(
      write(
        "プロフィール",
        sending(
          relay("yabu.me", "accepted"),
          relay("nos.lol", "rejected", "blocked: not allowed"),
          relay("relay.damus.io", "pending"),
        ),
      ),
    ),
    open: true,
  },
};

export const 保存しました: S = {
  args: {
    state: { writes: [], saved: ["ステータス", "フォロー", "フォロー"] },
  },
};

/** 名前が長くても折り返す。 */
export const 種類が多い: S = {
  args: {
    state: queue(
      write("投稿", { phase: "checking" }, true),
      write("返信", { phase: "checking" }, true),
      write("引用", { phase: "checking" }, true),
      write("チャンネルでの発言", { phase: "checking" }, true),
      write("チャット内のミュート", { phase: "checking" }),
      write("画像のアップロード先", { phase: "checking" }),
    ),
  },
};

export const 英語: S = {
  ...連続投稿で遅いリレーが残る,
  globals: { locale: "en" },
};
