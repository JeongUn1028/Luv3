import { NO_ZOOM, type PhotoZoom, type Point } from "./photo-zoom";

/** 밀어 닫는 동안 기록한 손가락 높이와 시각(ms) */
export interface DragSample {
  y: number;
  time: number;
}

/** 이만큼 넘게 내리고 놓으면 크게 보기를 닫는다 */
export const DISMISS_DISTANCE_PX = 120;

// 짧게 튕겨 닫을 때의 빠르기(px/ms)와 거리. 우연히 살짝 스친 것은 닫지 않는다
const DISMISS_VELOCITY = 0.5;
const DISMISS_FLICK_DISTANCE_PX = 30;
// 끝까지 밀어도 사진이 이보다 작아지지 않는다
const MIN_DISMISS_SCALE = 0.7;
const DISMISS_SCALE_DISTANCE_PX = 1000;
// 놓기 직전 이만큼의 기록으로 빠르기를 잰다. 기록 하나로 재면 겹쳐 온 이벤트나 마지막 제자리 기록에 휘둘린다
export const RELEASE_VELOCITY_WINDOW_MS = 100;

/**
 * 손가락이 처음 자리에서 움직인 거리로 밀어 닫기인지 본다. 옆으로 더 움직이면 사진 넘기기로 남긴다.
 *
 * @example isDismissDrag({ x: 4, y: 12 }) // true
 */
export const isDismissDrag = ({ x, y }: Point): boolean => y > 0 && y > Math.abs(x);

/**
 * 밀어 닫는 동안 사진을 손가락을 따라 옮기고, 내린 만큼 조금 줄여 닫힌다는 것을 보여 준다. 처음 자리보다 위로는 올리지 않는다.
 *
 * @example toDismissZoom({ x: 0, y: 100 }) // { scale: 0.9, x: 0, y: 100 }
 */
export const toDismissZoom = ({ x, y }: Point): PhotoZoom => {
  if (y <= 0) return NO_ZOOM;
  return { scale: Math.max(MIN_DISMISS_SCALE, 1 - y / DISMISS_SCALE_DISTANCE_PX), x, y };
};

interface ShouldDismissPhotoParams {
  /** 아래로 내린 거리(px) */
  distance: number;
  /** 놓기 직전 아래로 움직이던 빠르기(px/ms) */
  velocity: number;
}

/**
 * 놓았을 때 닫을지 정한다. 충분히 내렸거나, 짧게라도 빠르게 아래로 튕기면 닫는다.
 *
 * @example shouldDismissPhoto({ distance: 40, velocity: 0.8 }) // true
 */
export const shouldDismissPhoto = ({ distance, velocity }: ShouldDismissPhotoParams): boolean =>
  distance > DISMISS_DISTANCE_PX || (distance > DISMISS_FLICK_DISTANCE_PX && velocity > DISMISS_VELOCITY);

interface ToReleaseVelocityParams {
  samples: readonly DragSample[];
  /** 놓은 시각 */
  time: number;
}

/**
 * 놓기 직전 잠깐(`RELEASE_VELOCITY_WINDOW_MS`) 동안 아래로 움직인 평균 빠르기(px/ms)를 잰다. 그동안 기록이 없으면(멈춰 있었으면) 0이다.
 *
 * @example toReleaseVelocity({ samples: [{ y: 0, time: 900 }, { y: 100, time: 1000 }], time: 1000 }) // 1
 */
export const toReleaseVelocity = ({ samples, time }: ToReleaseVelocityParams): number => {
  const recent = samples.filter((sample) => time - sample.time <= RELEASE_VELOCITY_WINDOW_MS);
  const [first] = recent;
  const last = recent.at(-1);
  if (last === undefined || first === undefined || last.time <= first.time) return 0;
  return (last.y - first.y) / (last.time - first.time);
};
