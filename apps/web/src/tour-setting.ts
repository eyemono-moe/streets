import {
  TOUR_STORAGE_KEY,
  loadTourSeen,
  saveTourSeen,
} from "@streets/core/settings/tour-setting";

/** 使い方の案内を、この端末で見たか。ストレージが使えなければ、見ていないとみなす。 */
export const tourSeen = (): boolean => {
  try {
    return loadTourSeen(localStorage.getItem(TOUR_STORAGE_KEY));
  } catch {
    return false;
  }
};

/** 閉じた・最後まで見た・飛ばした、のどれでも残す。次からは自分から出さない。 */
export const markTourSeen = () => {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, saveTourSeen());
  } catch {
    // 残せなければ、次に開いたときにもう一度出るだけ。
  }
};
