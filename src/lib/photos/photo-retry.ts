/** 사진을 받지 못해 화면을 새로 받은 뒤 이 시간 안에는 다시 새로 받지 않는다. 여러 장이 한꺼번에 깨져도 한 번만 받게 한다 */
export const PHOTO_REFRESH_INTERVAL_MS = 60_000;

/** 사진 실패로 화면을 새로 받을 차례인지 정한다 */
export interface PhotoRefreshGate {
  /** 새로 받을 차례면 차지하고 true를 돌려준다 */
  tryClaim: () => boolean;
}

/**
 * 사진 실패로 화면을 새로 받는 횟수를 줄인다(#163). 만료된 주소면 펼친 그리드의 사진이 한꺼번에 실패한다.
 *
 * @param now 지금 시각. 테스트에서만 넘긴다
 * @example const gate = createPhotoRefreshGate()
 */
export const createPhotoRefreshGate = (now: () => number = Date.now): PhotoRefreshGate => {
  let claimedAt: number | undefined;
  return {
    tryClaim: () => {
      if (claimedAt !== undefined && now() - claimedAt < PHOTO_REFRESH_INTERVAL_MS) return false;
      claimedAt = now();
      return true;
    },
  };
};

/** 앱 전체에서 함께 쓰는 사진 실패 새로 받기 차례 */
export const photoRefreshGate = createPhotoRefreshGate();
