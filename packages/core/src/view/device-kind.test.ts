import { describe, expect, it } from "vitest";
import { deviceKind } from "./device-kind";

describe("deviceKind", () => {
  it("Android と iPhone を見分ける", () => {
    expect(
      deviceKind(
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile",
      ),
    ).toBe("android");
    expect(
      deviceKind(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe("ios");
  });

  it("Mac を名乗る iPad は、触れる画面なら iOS とみなす", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
    expect(deviceKind(ua, 5)).toBe("ios");
    expect(deviceKind(ua, 0)).toBe("pc");
  });

  it("それ以外は PC", () => {
    expect(
      deviceKind(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140",
      ),
    ).toBe("pc");
  });
});
