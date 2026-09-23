/** 署名器の承認待ちに、イベント番号ではなく操作の名前を見せる。 */
export const signingWaitMessage = (kind: number): string => {
  const action = (() => {
    switch (kind) {
      case 0:
        return "プロフィール";
      case 1:
        return "投稿";
      case 3:
        return "フォロー";
      case 5:
        return "投稿の削除";
      case 6:
        return "リポスト";
      case 7:
        return "リアクション";
      case 10_000:
        return "ミュート";
      case 10_002:
        return "リレーの設定";
      case 10_003:
        return "ブックマーク";
      case 30_078:
        return "設定";
      default:
        return "操作";
    }
  })();
  return `${action}の署名を待っています`;
};
