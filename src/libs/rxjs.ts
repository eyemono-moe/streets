import { from, scan } from "rxjs";
import { type Accessor, observable } from "solid-js";

export const signal2observable = <T>(signal: Accessor<T>) =>
  from(observable(signal));

export const toArrayScan = <T>(reverse?: boolean) =>
  scan<T, T[]>((acc, x) => (reverse ? [x, ...acc] : [...acc, x]), []);
