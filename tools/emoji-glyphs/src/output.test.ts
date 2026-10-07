import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vite-plus/test";

const root = new URL(
  "../../../apps/web/public/emoji-glyphs/v1",
  import.meta.url,
).pathname;

const files = (dir: string): string[] =>
  readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });

/**
 * 送った絵文字の見た目は、この輪郭で決まる。中身が変わると、同じ URL の絵文字の見た目が
 * 描き直したときに変わってしまうので、変えるときは v2 を足す。v1 を作り直してこのテストが
 * 落ちたら、作り直しを取り消す。
 */
it("v1 の輪郭は変わっていない", () => {
  const hash = createHash("sha256");
  for (const path of files(root)) {
    hash.update(relative(root, path));
    hash.update(readFileSync(path));
  }
  expect(hash.digest("hex")).toBe(
    "6c283bc4d87fe05664dfc41278abe3b1bda8cace551e3d4a4de7b2bc0a8b1529",
  );
});

it("書体ごとにライセンスの全文があり、NOTICE がある", () => {
  for (const font of ["gothic", "rounded", "serif"]) {
    const text = readFileSync(join(root, font, "OFL.txt"), "utf8");
    expect(text).toContain("SIL Open Font License");
  }
  expect(existsSync(join(root, "NOTICE.txt"))).toBe(true);
});
