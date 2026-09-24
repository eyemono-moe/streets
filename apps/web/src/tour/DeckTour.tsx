import { Tour, type TourStepDetails, useTour } from "@ark-ui/solid/tour";
import { type Component, For, createEffect, on } from "solid-js";
import { Portal } from "solid-js/web";
import { markTourSeen } from "../tour-setting";
import Button from "../ui/Button";
import type { TourTarget } from "./tour-target";
import TourCard from "./TourCard";

const target = (name: TourTarget) => () =>
  document.querySelector<HTMLElement>(`[data-tour="${name}"]`);

type Step = TourStepDetails;
type Placement = NonNullable<Step["placement"]>;
type Action = NonNullable<Step["actions"]>[number];

const SKIP = { label: "スキップ", action: "skip" } as const;
const BACK = { label: "戻る", action: "prev" } as const;
const NEXT = { label: "次へ", action: "next" } as const;

const pointAt = (
  id: TourTarget,
  title: string,
  description: string,
  placement: Placement,
  last = false,
): Step => ({
  id,
  type: "tooltip",
  target: target(id),
  title,
  description,
  placement,
  backdrop: true,
  actions: last
    ? // 最後のステップに「次」は無いので、閉じる動きにする（next のままだと押せない）。
      [BACK, { label: "はじめる", action: "dismiss" }]
    : [SKIP, BACK, NEXT],
});

/**
 * 案内のステップ。始めるときの画面の幅で作る（狭い画面では下のバーを指すので、
 * 吹き出しは上に出す）。
 */
export const tourSteps = (wide: boolean): Step[] => [
  {
    id: "welcome",
    type: "dialog",
    title: "Streets へようこそ！",
    description:
      "Streetsでは、見たいものをカラムに並べて、自分だけのタイムラインを作れます。このアプリの使い方をちょっとだけご案内します。",
    backdrop: true,
    meta: { welcome: true },
    actions: [SKIP, { label: "見てみる", action: "next" }],
  },
  pointAt(
    "columns",
    "これがカラム",
    wide
      ? "タイムラインや通知など、見たい情報がカラムごとに流れます。投稿をクリックして開くと、リプライも確認できます。"
      : "タイムラインや通知など、見たい情報がカラムごとに流れます。下のアイコンをタップしたり、画面を左右にスワイプして、ほかのカラムへ移れます。",
    wide ? "right-start" : "top",
  ),
  pointAt(
    "add-column",
    "好きなカラムを追加",
    "ユーザーの投稿、ハッシュタグでの検索結果など、気になるものを新しいカラムとして追加できます。",
    wide ? "right" : "top",
  ),
  pointAt(
    "compose",
    "投稿する",
    "ここからNostrへ投稿できます。",
    wide ? "right-start" : "top-end",
  ),
  pointAt(
    "account",
    "設定",
    "テーマやリレー、ミュート、プロフィールなどはここから変更できます。この案内も、いつでも見直せます。",
    wide ? "right-end" : "bottom-start",
    true,
  ),
];

/** 進むもの（次へ・はじめる・案内を見る）を目立たせ、飛ばすものは控えめにする。 */
const variantOf = (action: Action) =>
  action.action === "skip"
    ? "ghost"
    : action.action === "prev"
      ? "secondary"
      : "primary";

/**
 * 案内を出す。`requests` が増えるたびに、その時の画面の幅でステップを作り直して
 * 始める。一度も案内しない起動では読み込まれない（ツアーの部品は重い）。
 */
const DeckTour: Component<{ requests: number; wide: boolean }> = (props) => {
  const tour = useTour({
    steps: [],
    // 指す場所の外を押しても閉じない（押し間違いで案内が消えないように）。
    closeOnInteractOutside: false,
    translations: {
      progressText: ({ current, total }) => `${current + 1} / ${total}`,
    },
    onStatusChange: (details) => {
      if (details.status !== "started" && details.status !== "idle") {
        markTourSeen();
      }
    },
  });
  createEffect(
    on(
      () => props.requests,
      () => {
        tour().setSteps(tourSteps(props.wide));
        tour().start();
      },
    ),
  );
  return (
    <Tour.Root tour={tour} lazyMount unmountOnExit>
      <Portal>
        <Tour.Backdrop class="motion-fade fixed inset-0 bg-ui-950/40" />
        <Tour.Spotlight class="rounded-2 ring-2 ring-accent-5" />
        {/* 真ん中に出すステップ（dialog）は、Ark UI が置き場所を決めないので自分で置く。 */}
        <Tour.Positioner class="data-[type=dialog]:pointer-events-none data-[type=dialog]:fixed data-[type=dialog]:inset-0 data-[type=dialog]:grid data-[type=dialog]:place-items-center">
          <Tour.Content class="motion-pop pointer-events-auto w-max outline-none">
            <TourCard
              welcome={tour().step?.meta?.welcome === true}
              title={<Tour.Title class="font-600 text-body" />}
              description={<Tour.Description />}
              progress={
                tour().step?.meta?.welcome ? undefined : <Tour.ProgressText />
              }
              actions={
                <Tour.Actions>
                  {(actions) => (
                    <For each={actions()}>
                      {(action) => (
                        <Tour.ActionTrigger
                          action={action}
                          asChild={(triggerProps) => (
                            <Button
                              {...triggerProps()}
                              variant={variantOf(action)}
                              size="sm"
                            >
                              {action.label}
                            </Button>
                          )}
                        />
                      )}
                    </For>
                  )}
                </Tour.Actions>
              }
            />
          </Tour.Content>
        </Tour.Positioner>
      </Portal>
    </Tour.Root>
  );
};

export default DeckTour;
