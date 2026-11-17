/**
 * 크게 보기 사진의 확대 상태(#350). 사진 가운데를 기준으로 `scale`배 키운 뒤 (`x`, `y`)px 옮긴다.
 * 화면 좌표도 모두 틀 가운데를 (0, 0)으로 둔다.
 */
export interface PhotoZoom {
  scale: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

/** 누른 자리와 시각(ms) */
interface Tap extends Point {
  time: number;
}

/** 확대하지 않은 상태 */
export const NO_ZOOM: PhotoZoom = { scale: 1, x: 0, y: 0 };

/** 두 손가락으로 키울 수 있는 가장 큰 배율 */
export const MAX_ZOOM_SCALE = 4;

/** 두 번 눌렀을 때 키우는 배율 */
export const DOUBLE_TAP_ZOOM_SCALE = 2.5;

// 아이폰 사진 앱처럼 두 번 누르기 사이는 짧게, 손가락이 조금 어긋나는 것은 받아 준다
const DOUBLE_TAP_INTERVAL_MS = 300;
const DOUBLE_TAP_DISTANCE_PX = 30;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

interface ClampPhotoZoomParams {
  zoom: PhotoZoom;
  /** 확대하지 않았을 때 사진이 보이는 크기 */
  photo: Size;
  /** 사진 칸 크기 */
  frame: Size;
}

/**
 * 배율을 1~가장 큰 배율로 맞추고, 확대한 사진이 틀보다 크면 가장자리가 틀 안으로 들어오지 않게, 작으면 가운데에 둔다.
 *
 * @example clampPhotoZoom({ zoom: { scale: 2, x: 500, y: 0 }, photo: { width: 400, height: 300 }, frame: { width: 400, height: 800 } }) // { scale: 2, x: 200, y: 0 }
 */
export const clampPhotoZoom = ({ zoom, photo, frame }: ClampPhotoZoomParams): PhotoZoom => {
  if (zoom.scale <= 1) return NO_ZOOM;
  const scale = Math.min(zoom.scale, MAX_ZOOM_SCALE);
  const maxX = Math.max(0, (photo.width * scale - frame.width) / 2);
  const maxY = Math.max(0, (photo.height * scale - frame.height) / 2);
  return { scale, x: clamp(zoom.x, -maxX, maxX), y: clamp(zoom.y, -maxY, maxY) };
};

interface ToPinchZoomParams {
  /** 두 손가락을 댔을 때의 확대 상태 */
  start: PhotoZoom;
  startCenter: Point;
  startDistance: number;
  /** 지금 두 손가락의 가운데와 사이 거리 */
  center: Point;
  distance: number;
}

/**
 * 두 손가락을 벌리고 오므린 만큼 키우고 줄인다. 처음 손가락 가운데에 있던 사진 지점이 지금 손가락 가운데를 따라온다.
 * 옮긴 거리는 손을 뗄 때 `clampPhotoZoom`으로 맞춘다.
 *
 * @example toPinchZoom({ start: NO_ZOOM, startCenter: { x: 100, y: 0 }, startDistance: 100, center: { x: 100, y: 0 }, distance: 200 }) // { scale: 2, x: -100, y: 0 }
 */
export const toPinchZoom = ({ start, startCenter, startDistance, center, distance }: ToPinchZoomParams): PhotoZoom => {
  if (startDistance <= 0) return start;
  const scale = clamp((start.scale * distance) / startDistance, 1, MAX_ZOOM_SCALE);
  // 화면 지점 = 옮긴 거리 + 배율 × 사진 지점. 처음 가운데의 사진 지점을 지금 가운데에 두도록 옮긴 거리를 구한다
  const ratio = scale / start.scale;
  return { scale, x: center.x - ratio * (startCenter.x - start.x), y: center.y - ratio * (startCenter.y - start.y) };
};

interface ToDoubleTapZoomParams {
  zoom: PhotoZoom;
  /** 누른 자리 */
  point: Point;
}

/**
 * 두 번 누르면 원래 크기일 때는 누른 지점을 그 자리에 두고 키우고, 확대한 상태면 원래 크기로 돌린다.
 *
 * @example toDoubleTapZoom({ zoom: NO_ZOOM, point: { x: 100, y: 0 } }) // { scale: 2.5, x: -150, y: 0 }
 */
export const toDoubleTapZoom = ({ zoom, point }: ToDoubleTapZoomParams): PhotoZoom => {
  if (zoom.scale > 1) return NO_ZOOM;
  return { scale: DOUBLE_TAP_ZOOM_SCALE, x: point.x - DOUBLE_TAP_ZOOM_SCALE * point.x, y: point.y - DOUBLE_TAP_ZOOM_SCALE * point.y };
};

interface IsDoubleTapParams {
  previous: Tap | undefined;
  current: Tap;
}

/**
 * 앞 누르기와 짧은 사이에 가까운 곳을 눌렀는지 본다.
 *
 * @example isDoubleTap({ previous: { x: 0, y: 0, time: 0 }, current: { x: 5, y: 5, time: 200 } }) // true
 */
export const isDoubleTap = ({ previous, current }: IsDoubleTapParams): boolean => {
  if (previous === undefined) return false;
  return current.time - previous.time <= DOUBLE_TAP_INTERVAL_MS && Math.hypot(current.x - previous.x, current.y - previous.y) <= DOUBLE_TAP_DISTANCE_PX;
};
