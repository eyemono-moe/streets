import { readFileSync, readdirSync } from "node:fs";

export type ProcessMemory = Record<string, number>;

const read = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

/**
 * ブラウザのプロセスと、その子孫のメモリを、Chrome のプロセスの種類
 * （renderer・gpu-process など）ごとに足す。共有しているページを重ねて数えない
 * よう、RSS ではなく PSS を使う。Linux の `/proc` が無ければ空を返す。
 */
export const processMemory = (rootPid: number): ProcessMemory => {
  let pids: string[];
  try {
    pids = readdirSync("/proc").filter((name) => /^\d+$/.test(name));
  } catch {
    return {};
  }
  const parent = new Map<number, number>();
  for (const pid of pids) {
    // comm に空白や括弧が入ることがあるので、最後の「)」の後から読む。
    const stat = read(`/proc/${pid}/stat`);
    if (!stat) continue;
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    parent.set(Number(pid), Number(fields[1]));
  }
  const inTree = (pid: number): boolean => {
    for (let current = pid; current > 1; current = parent.get(current) ?? 0) {
      if (current === rootPid) return true;
    }
    return false;
  };

  const totals: ProcessMemory = {};
  for (const pid of parent.keys()) {
    if (!inTree(pid)) continue;
    const pss = read(`/proc/${pid}/smaps_rollup`)?.match(/^Pss:\s+(\d+) kB/m);
    if (!pss) continue;
    // Chrome は子プロセスの argv を書き換えるので、区切りが \0 とは限らない。
    const cmdline = read(`/proc/${pid}/cmdline`) ?? "";
    const type =
      cmdline.match(/--type=([\w-]+)/)?.[1] ??
      (pid === rootPid ? "browser" : "other");
    totals[type] = (totals[type] ?? 0) + Number(pss[1]) * 1024;
  }
  return totals;
};
