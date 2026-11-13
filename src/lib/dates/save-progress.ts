import type { SaveProgress } from "./save";

/**
 * 저장 버튼에 보일 진행 글자. 사진은 원본·썸네일까지 다 올린 장수를 센다(#312, 시안 7번).
 *
 * @example toSaveProgressLabel({ step: "uploading", done: 3, total: 10 }) // "사진 올리는 중… 3/10"
 */
export const toSaveProgressLabel = ({ step, done, total }: SaveProgress): string =>
  step === "uploading" ? `사진 올리는 중… ${done}/${total}` : "기록 저장 중…";

/**
 * 저장 버튼이 원래 분홍으로 차오른 정도(0~1). 사진을 다 올려 기록을 저장하는 동안은 다 찬다.
 *
 * @example toSaveProgressRatio({ step: "uploading", done: 3, total: 12 }) // 0.25
 */
export const toSaveProgressRatio = ({ step, done, total }: SaveProgress): number => {
  if (step === "saving" || total === 0) return 1;
  return Math.min(1, Math.max(0, done / total));
};
