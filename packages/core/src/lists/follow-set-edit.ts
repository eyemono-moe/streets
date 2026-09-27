import {
  type FollowSet,
  type FollowSetChange,
  applyFollowSetChanges,
  emptyFollowSet,
} from "./follow-set";

/**
 * 送っている途中のリストの変更。届くまで画面には読み取ったリストへ当てたものを
 * 出す。1 回の操作は 1 回の書き込みにする（`id` で送れた・失敗したを突き合わせる）。
 */
export type FollowSetWrite = {
  id: string;
  identifier: string;
  changes: FollowSetChange[];
  /** リストを消している。届くまで一覧から外して見せる。 */
  deleting?: boolean;
};

export type FollowSetEditState = { writing: FollowSetWrite[] };

export type FollowSetEditEvent =
  | { type: "follow-sets/write"; write: FollowSetWrite }
  /** 送れた・失敗した。失敗の知らせはトーストが出し、画面は読み取ったリストに戻る。 */
  | { type: "follow-sets/settled"; id: string };

/** 呼ぶたびに新しく作る。受け取った側が書き換えても他へ漏れないようにする。 */
export const emptyFollowSetEdit = (): FollowSetEditState => ({ writing: [] });

export const followSetEditTransition = (
  state: FollowSetEditState,
  event: FollowSetEditEvent,
): FollowSetEditState => {
  switch (event.type) {
    case "follow-sets/write":
      return {
        writing: [
          ...state.writing,
          { ...event.write, changes: [...event.write.changes] },
        ],
      };
    case "follow-sets/settled":
      return {
        writing: state.writing.filter((write) => write.id !== event.id),
      };
  }
};

/**
 * 読み取ったリストに、送っている途中の変更を当てる。作った直後でまだ届いて
 * いないリストも、ここで一覧に出す。
 */
export const displayedFollowSets = (
  saved: readonly FollowSet[],
  state: FollowSetEditState,
  viewer: string,
): FollowSet[] => {
  const deleting = new Set(
    state.writing
      .filter((write) => write.deleting)
      .map((write) => write.identifier),
  );
  const known = new Set(saved.map((set) => set.identifier));
  const created = [
    ...new Set(
      state.writing
        .filter((write) => !write.deleting && !known.has(write.identifier))
        .map((write) => write.identifier),
    ),
  ].map((identifier) => emptyFollowSet(viewer, identifier));
  return [...saved, ...created]
    .filter((set) => !deleting.has(set.identifier))
    .map((set) =>
      applyFollowSetChanges(
        set,
        state.writing
          .filter((write) => write.identifier === set.identifier)
          .flatMap((write) => write.changes),
      ),
    );
};
