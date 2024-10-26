import { type Accessor, createEffect } from "solid-js";

interface Transform<L, R> {
  ltr: (left: L) => R | Promise<R>;
  rtl: (right: R) => L | Promise<L>;
}

export const createSync = <L, R>(
  left: Accessor<L>,
  setLeft: (v: L) => void,
  right: Accessor<R>,
  setRight: (v: R) => void,
  transform?: Transform<L, R>,
) => {
  let settingLeft = false;
  let settingRight = false;

  // TODO: typing
  const transformLtR = transform?.ltr ?? ((left) => left as unknown as R);
  const transformRtL = transform?.rtl ?? ((right) => right as unknown as L);

  createEffect(async () => {
    const _left = left();
    if (settingLeft) {
      settingLeft = false;
      return;
    }
    settingRight = true;
    setRight(await transformLtR(_left));
  });

  createEffect(async () => {
    const _right = right();
    if (settingRight) {
      settingRight = false;
      return;
    }
    settingLeft = true;
    setLeft(await transformRtL(_right));
  });

  // createComputed(async () => {
  //   const _left = left();
  //   if (settingLeft) {
  //     settingLeft = false;
  //     return;
  //   }
  //   settingRight = true;
  //   setRight(await transformLtR(_left));
  // });

  // createComputed(async () => {
  //   const _right = right();
  //   if (settingRight) {
  //     settingRight = false;
  //     return;
  //   }
  //   settingLeft = true;
  //   setLeft(await transformRtL(_right));
  // });

  return [
    [left, setLeft],
    [right, setRight],
  ] as const;
};
