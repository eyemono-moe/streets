import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type NotificationRow,
  actionRowsByTarget,
  notificationRows,
} from "@streets/core/view/notification-rows";
import { type Component, For, type ParentComponent } from "solid-js";
import { t } from "../../i18n/locale";
import FollowSetListView from "../../lists/FollowSetListView";
import Event from "../../note/Event";
import { ReadLayerProvider } from "../../read-layer";
import { useDispatch } from "../../ui-events";
import Button from "../../ui/Button";
import { NotificationRowView } from "../blocks/NotificationList";
import {
  sampleActivity,
  sampleFollowSets,
  sampleNotifications,
  sampleTimeline,
} from "./sample-data";
import { createSampleReadAccess } from "./sample-read-layer";

/** 見本の上に出す案内。カラムの種類ごとに、ログインすると何が見えるかを書く。 */
export type SampleGuide = { heading: string; body: string };

/**
 * ログインしていない人に見せる見本の枠。見本は上から中ほどにかけて薄くし、
 * まん中に案内を置く。見本は触れないようにし、操作はログインへの案内だけにする。
 */
const SampleFrame: ParentComponent<
  SampleGuide & { events: readonly NostrEvent[] }
> = (props) => {
  const dispatch = useDispatch();
  // 見本のイベントは、アプリの読み取り層に入れず、この枠だけで読む。
  const access = createSampleReadAccess(props.events);
  return (
    <div class="relative h-full min-h-120 overflow-hidden">
      <div
        inert
        aria-hidden="true"
        class="pointer-events-none select-none [mask-image:linear-gradient(to_bottom,black_0%,transparent_40%)]"
      >
        <ReadLayerProvider value={access}>{props.children}</ReadLayerProvider>
      </div>
      <div class="absolute inset-x-0 top-[42%] flex flex-col items-center gap-3 px-6 text-center">
        <span class="c-secondary rounded-full border border-control px-2.5 py-0.5 text-caption">
          {t("columns.sample.label")}
        </span>
        <p class="font-600 text-body leading-relaxed">{props.heading}</p>
        <p class="c-secondary text-caption leading-relaxed">{props.body}</p>
        <Button
          variant="primary"
          icon="i-material-symbols:login-rounded"
          onClick={() => dispatch({ type: "deck/login" })}
        >
          {t("columns.sample.login")}
        </Button>
      </div>
    </div>
  );
};

const EventRows: Component<{ events: readonly NostrEvent[] }> = (props) => (
  <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
    <For each={props.events}>
      {(event) => <Event event={event} size="normal" expandMedia />}
    </For>
  </div>
);

/** フォローしている人の投稿が流れるカラム（ホーム・タイムスリップ・ブックマーク）。 */
export const TimelineSample: Component<SampleGuide> = (props) => {
  const scene = sampleTimeline();
  return (
    <SampleFrame {...props} events={scene.events}>
      <EventRows events={scene.items} />
    </SampleFrame>
  );
};

const NotificationRows: Component<{ rows: readonly NotificationRow[] }> = (
  props,
) => (
  <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
    <For each={props.rows}>
      {(row) => (
        <NotificationRowView
          row={row}
          size="normal"
          expandMedia
          foldsMuted={false}
        />
      )}
    </For>
  </div>
);

export const NotificationsSample: Component<SampleGuide> = (props) => {
  const scene = sampleNotifications();
  return (
    <SampleFrame {...props} events={scene.events}>
      <NotificationRows rows={notificationRows(scene.items, true)} />
    </SampleFrame>
  );
};

export const ActivitySample: Component<SampleGuide> = (props) => {
  const scene = sampleActivity();
  // ActionFeedView は行を VirtualList で描き、カラムのスクロールに合わせて行を作る。
  // 見本はスクロールさせないので、測る前の行が描かれないまま空に見える。行は全部描く。
  return (
    <SampleFrame {...props} events={scene.events}>
      <NotificationRows rows={actionRowsByTarget(scene.items, true)} />
    </SampleFrame>
  );
};

export const FollowSetsSample: Component<SampleGuide> = (props) => {
  const scene = sampleFollowSets();
  return (
    <SampleFrame {...props} events={scene.events}>
      <FollowSetListView
        own={scene.items}
        ownSettled
        memberOf={[]}
        memberOfSettled
        onBrowseMemberOf={() => {}}
        onOpen={() => {}}
      />
    </SampleFrame>
  );
};
