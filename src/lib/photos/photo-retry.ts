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

/** 받지 못한 사진들. 화면을 새로 받을 때 모두 새 요소로 다시 받게 한다(#407) */
export interface BrokenPhotoList {
  /** 깨진 사진을 다시 받는 일을 적는다. 돌려준 함수는 적은 것을 지운다(다 받았거나 화면에서 사라졌을 때) */
  add: (retry: () => void) => () => void;
  /** 적힌 일을 모두 꺼내고 목록을 비운다. 화면을 새로 받는 순간에 불러, 그 화면에서 모두 다시 받게 한다 */
  takeAll: () => (() => void)[];
  /**
   * 다시 연결됐을 때 새로 받을 차례인지 정한다. 깨진 사진이 있고 이 연결 알림을 아직 아무도 쓰지 않았으면 true.
   * 사진마다 연결 알림을 듣지만 한 알림에 한 번만 새로 받게 한다
   */
  tryClaimReconnect: (event: Event) => boolean;
}

/**
 * 받지 못한 사진 목록을 만든다. 잠깐 끊겨 여러 장이 깨지면, 새로 받기 차례를 얻은 한 장만이 아니라 모두 다시 받아야 한다.
 *
 * @example const list = createBrokenPhotoList(); const remove = list.add(() => setRetryCount((count) => count + 1))
 */
export const createBrokenPhotoList = (): BrokenPhotoList => {
  const retries = new Set<() => void>();
  let claimedEvent: Event | undefined;
  return {
    add: (retry) => {
      retries.add(retry);
      return () => void retries.delete(retry);
    },
    takeAll: () => {
      const taken = [...retries];
      retries.clear();
      return taken;
    },
    tryClaimReconnect: (event) => {
      if (retries.size === 0 || claimedEvent === event) return false;
      claimedEvent = event;
      return true;
    },
  };
};

/** 앱 전체에서 함께 쓰는 받지 못한 사진 목록 */
export const brokenPhotos = createBrokenPhotoList();

/** 한 주소로 깨진 사진을 다시 받는 최대 횟수. 다시 연결된 직후 아직 통신이 안 돼 한 번 더 실패해도 한 번은 더 받고, 영영 없는 사진은 되풀이하지 않는다 */
export const MAX_PHOTO_RETRIES = 2;

/**
 * 깨진 사진을 목록에 적어 다음 새로 받기 때 다시 받을지 정한다.
 *
 * @param retryCount 지금 주소로 이미 다시 받은 횟수
 * @example if (canRetryPhoto(retryCount)) markBroken()
 */
export const canRetryPhoto = (retryCount: number): boolean => retryCount < MAX_PHOTO_RETRIES;
