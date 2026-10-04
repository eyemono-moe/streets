/** 公開 URL を持つ Guide の枝。並び順は手動で辿る画面の順番。 */
export const GUIDE_CATEGORIES = [
  {
    id: "login",
    path: "/help/login",
    title: "ログイン",
    description: "アカウントを使い始める",
  },
  {
    id: "column",
    path: "/help/column",
    title: "カラム",
    description: "見る内容を増やす",
  },
  {
    id: "post",
    path: "/help/post",
    title: "投稿",
    description: "文章を送る",
  },
  {
    id: "relay",
    path: "/help/relay",
    title: "読み込みとリレー",
    description: "投稿が表示されないとき",
  },
] as const;

type GuideCategoryId = (typeof GUIDE_CATEGORIES)[number]["id"];

/** Signal の公開 URL と分類対象。ID と path は外部から参照されるため変更しない。 */
export type Guide = {
  id: string;
  category: GuideCategoryId;
  path: `/help/${string}`;
  title: string;
  description: string;
  content: readonly string[];
};

export const GUIDES = [
  {
    id: "login.browser-extension",
    category: "login",
    path: "/help/login/browser-extension",
    title: "拡張機能でログインする",
    description: "パソコンのブラウザ拡張機能を使って Streets にログインする",
    content: [
      "ブラウザに Nostr の署名に対応した拡張機能を入れ、拡張機能の中でアカウントを用意します。",
      "Streets の紹介とログインのカラムで「拡張機能でログイン」を選び、拡張機能に表示される確認を承認してください。Streets に秘密鍵を貼り付ける必要はありません。",
    ],
  },
  {
    id: "login.remote-signer",
    category: "login",
    path: "/help/login/remote-signer",
    title: "リモート署名器でログインする",
    description: "Amber や Primal などの署名器を使って Streets にログインする",
    content: [
      "鍵を預かるアプリでアカウントを用意します。Streets の紹介とログインのカラムで「リモート署名器でログイン」を選んでください。",
      "署名器が同じ端末にある場合は「この端末の署名器で開く」を使い、別の端末にある場合は表示された QR コードを読み取ります。署名器に表示される確認を承認してください。",
    ],
  },
  {
    id: "column.add",
    category: "column",
    path: "/help/column/add",
    title: "カラムを追加する",
    description: "デッキに新しいカラムを追加して見る内容を選ぶ",
    content: [
      "サイドバーの「カラムを追加」を開き、見たい内容を選んでください。追加したカラムはデッキの右端に表示されます。",
      "スマートフォンでは、画面下部の追加ボタンから同じ操作ができます。",
    ],
  },
  {
    id: "post.create",
    category: "post",
    path: "/help/post/create",
    title: "投稿する",
    description: "新しい投稿を書いて送る",
    content: [
      "投稿ボタンを押すと入力欄が開きます。本文を書き、送信してください。",
      "送信にはログインが必要です。送れなかった場合は画面に表示されるお知らせを確認してください。",
    ],
  },
  {
    id: "relay.troubleshooting",
    category: "relay",
    path: "/help/relay/troubleshooting",
    title: "投稿が表示されないとき",
    description: "投稿が流れてこないときにリレーの接続を確認する",
    content: [
      "通信状態を確認し、少し待ってからカラムを開き直してください。取得中の投稿はまだ表示されません。",
      "改善しない場合は、設定の「リレー」で接続先と状態を確認してください。",
    ],
  },
] as const satisfies readonly Guide[];

export const guideByPath = (path: string): Guide | undefined =>
  GUIDES.find((guide) => guide.path === path);

export const guideById = (id: string): Guide | undefined =>
  GUIDES.find((guide) => guide.id === id);

export const guideCategoryByPath = (path: string) =>
  GUIDE_CATEGORIES.find((category) => category.path === path);

export const guidesInCategory = (category: GuideCategoryId): Guide[] =>
  GUIDES.filter((guide) => guide.category === category);
