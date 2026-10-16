import {
  type MediaAttempt,
  type NoteMedia,
  mediaAttempts,
} from "@streets/core/view/note-layout";
import { type Accessor, createMemo, createSignal } from "solid-js";

/**
 * 画像・動画を読めなかったら次を試す。`current` が `undefined` になったら、どれも
 * 読めなかった。失敗の数は試す並びと組で持ち、別の画像・動画に変わったら最初から試す
 * （effect で数を戻すと、戻すまでの間に新しい並びの途中を読みにいく）。
 */
export const createMediaAttempts = (media: Accessor<NoteMedia>) => {
  const attempts = createMemo(() => mediaAttempts(media()));
  const [failed, setFailed] = createSignal<{
    attempts: MediaAttempt[];
    count: number;
  }>();
  const failedCount = () => {
    const current = failed();
    return current?.attempts === attempts() ? current.count : 0;
  };
  const current = (): MediaAttempt | undefined => attempts()[failedCount()];
  return {
    current,
    /** 読めなかったものを渡す。同じ失敗が 2 回届いても 1 つだけ進める。 */
    next: (attempt: MediaAttempt) => {
      if (attempt !== current()) return;
      setFailed({ attempts: attempts(), count: failedCount() + 1 });
    },
  };
};
