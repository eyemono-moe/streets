import type { ReleaseNote } from "../../release-notes-plugin";

const VERSION = /^v(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/;

/** 新しい版から並べる。プレリリース（-rc.1 など）は同じ番号の正式版より前（古い側）に置く。 */
const compareDesc = (a: ReleaseNote, b: ReleaseNote): number => {
  const left = VERSION.exec(a.version);
  const right = VERSION.exec(b.version);
  if (!left || !right) return b.version.localeCompare(a.version);
  for (const index of [1, 2, 3]) {
    const diff = Number(right[index]) - Number(left[index]);
    if (diff !== 0) return diff;
  }
  if (left[4] === right[4]) return 0;
  if (left[4] === undefined) return -1;
  if (right[4] === undefined) return 1;
  return right[4].localeCompare(left[4]);
};

// ファイル（src/releases/v1.2.3.md）は release-notes-plugin がビルドのときに HTML にする。
const modules = import.meta.glob<ReleaseNote>("../releases/v*.md", {
  query: "?release-note",
  import: "default",
  eager: true,
});

/** アプリに同梱した歴代のリリースノート。新しい版から。 */
export const bundledReleaseNotes: readonly ReleaseNote[] =
  Object.values(modules).sort(compareDesc);
