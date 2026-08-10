/**
 * 「pubkey が確定した時点から、いずれかのカラムに最初のノートが描画される
 * まで」を測る `first-render-ms` (task-5-brief.md Step 1) の、初回だけを
 * 記録する部分をここへ閉じ込める。
 *
 * **測る区間は 1 回きりの現象**（最初に何かが描画された瞬間）であり、
 * カラムが 3 本あるどれか 1 本でもこの条件を満たせば、それより後にどの
 * カラムが埋まっても意味を持たない。呼び出し側 (`v1.tsx`) は
 * `DeckColumn` ごとの `items().length` が正になるたびにこの関数を呼びうる
 * (3 カラムが前後してほぼ同時に空でなくなることもある) が、**2 回目以降の
 * 呼び出しを無視する**のがこの関数の全て —— ここで上書きを許すと、値が
 * 「最初の描画」ではなく「直近にどれかのカラムが埋まった時刻」という
 * 別の (デバッグに使えない) 数値になってしまう。
 *
 * クロージャで `recorded` を持つ関数オブジェクトではなく、生成のたびに
 * 独立した「初回だけ通す」関数を返すファクトリにしている理由は
 * テストのしやすさ —— 呼び出しごとに新しいレコーダを作れば、
 * グローバルな可変状態を共有せずに複数のシナリオを並べて書ける。
 */
export const createFirstRenderRecorder = (): ((
  ms: number,
) => number | undefined) => {
  let recorded = false;
  return (ms: number): number | undefined => {
    if (recorded) return undefined;
    recorded = true;
    return ms;
  };
};
