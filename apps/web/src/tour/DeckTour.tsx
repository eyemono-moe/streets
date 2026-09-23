import { Tour, type TourStepDetails, useTour } from "@ark-ui/solid/tour";
import { type Accessor, type Component, For } from "solid-js";
import { Portal } from "solid-js/web";
import { markTourSeen } from "../tour-setting";
import Button from "../ui/Button";
import TourCard from "./TourCard";

/** 案内が指す場所。広い画面と狭い画面の、同じ役割の要素に同じ印を付ける。 */
export type TourTarget = "columns" | "add-column" | "compose" | "account";

/** 指す場所に付ける属性。今描いている画面にだけあるので、幅に合わせて指す先が替わる。 */
export const tourTarget = (name: TourTarget) => ({ "data-tour": name });

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
    title: "Streets へようこそ",
    description: "使い方を 4 つだけ案内します。30 秒ほどで終わります。",
    backdrop: true,
    meta: { welcome: true },
    actions: [SKIP, { label: "案内を見る", action: "next" }],
  },
  pointAt(
    "columns",
    "カラム",
    wide
      ? "フォロー中の人の投稿や通知が、カラムに流れます。投稿を押すと、その会話がカラムの上に重なります。"
      : "フォロー中の人の投稿や通知が、カラムに流れます。下のアイコンを押すか左右に払うと、ほかのカラムへ移れます。投稿を押すと、その会話が上に重なります。",
    wide ? "right-start" : "top",
  ),
  pointAt(
    "add-column",
    "カラムを足す",
    "ハッシュタグや人、リレーなど、見たいものをカラムにして並べられます。足したカラムの幅や表示は、あとから変えられます。",
    wide ? "right" : "top",
  ),
  pointAt(
    "compose",
    "投稿する",
    "ここから投稿できます。",
    wide ? "right-start" : "top-end",
  ),
  pointAt(
    "account",
    "設定",
    "表示の色、リレー、ミュート、プロフィールはここから変えられます。この案内は「Streets について」からもう一度見られます。",
    wide ? "right-end" : "bottom-start",
    true,
  ),
];

/** 案内を動かす。始めるときに、その時の画面の幅でステップを作り直す。 */
export const createDeckTour = (wide: Accessor<boolean>) => {
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
  return {
    tour,
    start: () => {
      tour().setSteps(tourSteps(wide()));
      tour().start();
    },
  };
};

/** 進むもの（次へ・はじめる・案内を見る）を目立たせ、飛ばすものは控えめにする。 */
const variantOf = (action: Action) =>
  action.action === "skip"
    ? "ghost"
    : action.action === "prev"
      ? "secondary"
      : "primary";

export const DeckTour: Component<{
  tour: ReturnType<typeof useTour>;
}> = (props) => (
  <Tour.Root tour={props.tour} lazyMount unmountOnExit>
    <Portal>
      <Tour.Backdrop class="motion-fade fixed inset-0 bg-ui-950/40" />
      <Tour.Spotlight class="rounded-2 ring-2 ring-accent-5" />
      {/* 真ん中に出すステップ（dialog）は、Ark UI が置き場所を決めないので自分で置く。 */}
      <Tour.Positioner class="data-[type=dialog]:pointer-events-none data-[type=dialog]:fixed data-[type=dialog]:inset-0 data-[type=dialog]:grid data-[type=dialog]:place-items-center">
        <Tour.Content class="motion-pop pointer-events-auto w-max outline-none">
          <TourCard
            welcome={props.tour().step?.meta?.welcome === true}
            title={<Tour.Title class="font-600 text-body" />}
            description={<Tour.Description />}
            progress={
              props.tour().step?.meta?.welcome ? undefined : (
                <Tour.ProgressText />
              )
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
