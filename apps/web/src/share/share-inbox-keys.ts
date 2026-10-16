/** manifest の `share_target.action`。 */
export const SHARE_ACTION = "/share";
/** 共有で届いた中身を、アプリが開くまで置いておく Cache Storage の名前。 */
export const SHARE_CACHE = "share-inbox";
/** アプリへ渡す URL の引数。中身の置き場所の id を入れる。 */
export const SHARE_PARAM = "share";
/** 置けなかったときに `SHARE_PARAM` へ入れる値。 */
export const SHARE_FAILED = "failed";

export const shareInboxKey = (id: string): string => `/share-inbox/${id}`;
