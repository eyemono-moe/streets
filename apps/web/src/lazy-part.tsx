import {
  type Accessor,
  type Component,
  Show,
  createComponent,
  createMemo,
  createSignal,
  untrack,
} from "solid-js";
import { toaster } from "./toast";

type Loader<P extends Record<string, unknown>> = () => Promise<{
  default: Component<P>;
}>;

export type LazyPart<P extends Record<string, unknown>> = Component<P> & {
  /** 描く前に読んでおく。失敗しても知らせない（描くときにもう一度読む）。 */
  preload: () => void;
};

/**
 * 起動の直後には要らない部品を、別のファイルに分けて後から読む。
 * 読み終えるまではそこだけ何も描かない。
 *
 * Solid の `lazy` は使わない。読めなかった結果を覚えてしまい、ページを読み直すまで
 * 二度と読みにいかない。デプロイで古い版のファイルが消えた直後や、通信が切れたときには
 * 読めないことがあるので、次に描くときにもう一度読みにいく。
 */
export const lazyPart = <P extends Record<string, unknown>>(
  load: Loader<P>,
): LazyPart<P> => {
  let loaded: Component<P> | undefined;
  let loading: Promise<Component<P>> | undefined;
  const request = () => {
    loading ??= load().then(
      (module) => {
        loaded = module.default;
        return loaded;
      },
      (cause) => {
        loading = undefined;
        throw cause;
      },
    );
    return loading;
  };

  const Part = ((props: P) => {
    const [component, setComponent] = createSignal(loaded);
    if (!loaded) {
      request().then(
        (value) => setComponent(() => value),
        (cause) => notifyLoadFailure(cause),
      );
    }
    return (
      <Show when={component()}>
        {(value) => untrack(() => createComponent(value(), props))}
      </Show>
    );
  }) as LazyPart<P>;
  Part.preload = () => {
    request().catch(() => {});
  };
  return Part;
};

const notifyLoadFailure = (cause: unknown) => {
  console.error(cause);
  toaster.create({
    type: "error",
    title: "画面の一部を読み込めませんでした",
    description:
      "ページを再読み込みしてください。新しい版が公開された直後や、通信が切れているときに起きます。",
  });
};

/**
 * 一度でも真になったら、その後はずっと真。閉じる動きを見せるために、
 * 閉じた後も部品を残しておきたいときに使う（中身は Ark UI が閉じている間は作らない）。
 */
export const onceTrue = (when: Accessor<boolean>): Accessor<boolean> => {
  let seen = false;
  return createMemo(() => {
    seen ||= when();
    return seen;
  });
};

/**
 * 手が空いたときに呼ぶ。起動直後の描画や購読の組み立てと取り合わないように、
 * 後で要る部品の読み込みはここへ回す。
 */
export const whenIdle = (task: () => void): void => {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(task, { timeout: 5000 });
  } else {
    setTimeout(task, 2000);
  }
};
