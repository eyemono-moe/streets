import { scan } from "rxjs";

export const toArrayScan = <T>(reverse?: boolean) =>
  scan<T, T[]>((acc, x) => (reverse ? [x, ...acc] : [...acc, x]), []);
