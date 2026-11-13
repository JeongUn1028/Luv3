import { MAX_GROUP_PHOTOS } from "./photo-group-draft";

/** 사진을 고른 결과 중 알릴 것 */
interface PickNoticeParams {
  /** 받을 수 없는 형식이라 뺀 파일 수 */
  skippedCount: number;
  /** 모음에 넘쳐 뺀 사진 수 */
  droppedCount: number;
  /** 새 모음 만들기로 골랐는지. 남은 사진을 새 모음으로 고르라고 덧붙인다 */
  isNewGroup: boolean;
}

/**
 * 사진을 고른 뒤 알릴 문구. 받을 수 없는 파일과 모음에 넘쳐 뺀 사진 수를 알리고, 뺀 것이 없으면 없다.
 *
 * @example toPickNotice({ skippedCount: 2, droppedCount: 0, isNewGroup: false }) // "JPEG·PNG·WebP·HEIC 사진만 올릴 수 있어 2개는 뺐어요."
 */
export const toPickNotice = ({ skippedCount, droppedCount, isNewGroup }: PickNoticeParams): string | undefined => {
  const messages = [
    skippedCount > 0 && `JPEG·PNG·WebP·HEIC 사진만 올릴 수 있어 ${skippedCount}개는 뺐어요.`,
    droppedCount > 0 && `모음 하나에 사진은 ${MAX_GROUP_PHOTOS}장까지라 ${droppedCount}장은 뺐어요.${isNewGroup ? " 남은 사진은 새 모음으로 골라 주세요." : ""}`,
  ].filter(Boolean);
  return messages.length > 0 ? messages.join(" ") : undefined;
};
