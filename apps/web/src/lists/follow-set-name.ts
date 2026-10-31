import { type FollowSet, followSetLabel } from "@streets/core/lists/follow-set";
import { messageOrText } from "../i18n/locale";

/** 画面に出すリストの名前。題名も識別子も無いリストには、名前が無いと言う文言を当てる。 */
export const followSetName = (
  set: Pick<FollowSet, "title" | "identifier">,
): string => messageOrText(followSetLabel(set));
