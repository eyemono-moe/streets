import * as v from "valibot";
import { expect, test } from "vitest";
import { lud06 } from "./zap";

test("is lud06", () => {
  const target = "lnurl1wajk2umpd3skgvecgpmkzmrvv46x7ennv96x7umgdyhxxmmdl2rjr2";

  const parsed = v.safeParse(lud06, target);

  expect(parsed.success).toEqual(true);
});

test("invalid lud06", () => {
  const target = "lnurl1wajk2umpd3skgvecgpmkzmrvv46x7ennv96x7umgdyhxxmdl2rjr2";

  const parsed = v.safeParse(lud06, target);

  expect(parsed.success).toEqual(false);
});
