/** 화면 왼쪽 끝에서 이 폭 안에서 시작한 밀기는 사파리의 뒤로 가기 몸짓에 양보한다(#348) */
export const BACK_GESTURE_EDGE_PX = 24;

/** 이만큼 움직이기 전에는 가로로 미는지 세로로 스크롤하는지 정하지 않는다 */
const AXIS_LOCK_PX = 10;

/** 달력 폭의 이 비율보다 많이 밀면 넘긴다 */
const COMMIT_WIDTH_RATIO = 1 / 4;

/** 이 빠르기(px/ms)보다 빠르게 튕기면 덜 밀어도 넘긴다 */
const FLICK_VELOCITY = 0.5;

/** 튕기기로 치려면 적어도 이만큼은 밀어야 한다. 누르다 살짝 흔들린 것을 넘기기로 치지 않는다 */
const FLICK_MIN_PX = 20;

/** 밀기를 시작한 자리가 뒤로 가기 몸짓에 양보할 왼쪽 끝인지 */
export const isBackGestureEdge = (clientX: number): boolean => clientX < BACK_GESTURE_EDGE_PX;

/** 손가락이 움직인 방향. 아직 덜 움직였으면 `undecided` */
export type SwipeAxis = "undecided" | "horizontal" | "vertical";

interface Movement {
  dx: number;
  dy: number;
}

/**
 * 손가락이 움직인 거리로 가로 밀기인지 세로 스크롤인지 정한다. 같은 거리면 스크롤로 본다.
 *
 * @example getSwipeAxis({ dx: -30, dy: 4 }) // "horizontal"
 */
export const getSwipeAxis = ({ dx, dy }: Movement): SwipeAxis => {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return "undecided";
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
};

/** 손을 뗄 때 빠르기는 이 시간 안의 움직임으로 잰다. 누른 채 멈췄다 튕겨도 튕긴 빠르기를 쓴다 */
const VELOCITY_WINDOW_MS = 100;

/** 손가락이 지난 자리와 그때 시각(ms) */
export interface SwipeSample {
  x: number;
  time: number;
}

/**
 * 새 자리를 더하고, 빠르기를 잴 최근 100ms 안의 자리만 남긴다.
 *
 * @example const samples = addSwipeSample(previous, { x: event.clientX, time: event.timeStamp });
 */
export const addSwipeSample = (samples: readonly SwipeSample[], sample: SwipeSample): SwipeSample[] => {
  const next = [...samples, sample];
  const firstInWindow = next.findIndex(({ time }) => sample.time - time <= VELOCITY_WINDOW_MS);
  return next.slice(firstInWindow);
};

/**
 * 남긴 자리들로 가로 빠르기(px/ms, 오른쪽이 +)를 잰다. 자리가 하나뿐이거나 시간이 흐르지 않았으면 0.
 *
 * @example getSwipeVelocity([{ x: 100, time: 0 }, { x: 40, time: 60 }]) // -1
 */
export const getSwipeVelocity = (samples: readonly SwipeSample[]): number => {
  const first = samples.at(0);
  const last = samples.at(-1);
  if (!first || !last || last.time <= first.time) return 0;
  return (last.x - first.x) / (last.time - first.time);
};

interface DecideMonthSwipeParams {
  /** 손을 뗄 때까지 가로로 민 거리(오른쪽이 +) */
  dx: number;
  /** 달력 폭 */
  width: number;
  /** 손을 떼기 직전 가로 빠르기(px/ms, 오른쪽이 +) */
  velocity: number;
}

/**
 * 손을 뗐을 때 몇 달 옮길지 정한다. 왼쪽으로 밀면 다음 달(1), 오른쪽으로 밀면 이전 달(-1), 덜 밀면 제자리(0).
 * 폭의 4분의 1보다 많이 밀었거나, 20px 넘게 민 방향으로 빠르게 튕겼으면 넘긴다.
 *
 * @example decideMonthSwipe({ dx: -120, width: 360, velocity: -0.2 }) // 1
 */
export const decideMonthSwipe = ({ dx, width, velocity }: DecideMonthSwipeParams): -1 | 0 | 1 => {
  const distance = Math.abs(dx);
  const isFlick = distance > FLICK_MIN_PX && Math.sign(velocity) === Math.sign(dx) && Math.abs(velocity) > FLICK_VELOCITY;
  if (distance <= width * COMMIT_WIDTH_RATIO && !isFlick) return 0;
  return dx < 0 ? 1 : -1;
};
