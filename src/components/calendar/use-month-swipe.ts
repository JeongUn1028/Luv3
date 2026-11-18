"use client";

import { useEffect, useLayoutEffect, useRef, type PointerEvent, type RefObject } from "react";
import { addSwipeSample, decideMonthSwipe, getSwipeAxis, getSwipeVelocity, isBackGestureEdge, type SwipeAxis, type SwipeSample } from "@/lib/calendar/swipe";

/** 넘길 때 보던 달이 옆으로 밀려나는 시간과, 새 달이 제자리로 들어오는 시간. 시안 https://claude.ai/artifact/9vcjFcbqqYW5Snpbe3nZiq 2-A */
const SLIDE_OUT_MS = 180;
const SLIDE_IN_MS = 200;
/** 새 달은 폭 전체가 아니라 이만큼 옆에서 들어와, 짧은 시간에도 눈이 따라가게 한다 */
const SLIDE_IN_FROM_RATIO = 0.4;
/** 넘긴 달이 이 시간 안에 그려지지 않으면(이미 그 달로 옮겨 있었음 등) 칸을 제자리로 돌려놓는다 */
const SLIDE_IN_FALLBACK_MS = 1_000;

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  axis: SwipeAxis;
  dx: number;
  samples: SwipeSample[];
}

interface UseMonthSwipeParams {
  /** 보는 달 YYYY-MM. 바뀌면 새 달이 그려진 것으로 보고 제자리로 들여온다 */
  month: string;
  /** 왼쪽으로 밀면 1(다음 달), 오른쪽으로 밀면 -1(이전 달) */
  onSwipe: (shift: 1 | -1) => void;
}

interface MonthSwipe {
  /** 손가락을 따라 움직일 달력 칸 감싸개 */
  trackRef: RefObject<HTMLDivElement | null>;
  /** 감싸개에 붙일 손가락 처리 */
  swipeHandlers: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  };
}

const isMotionReduced = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const moveTrack = (track: HTMLElement, offset: number, transition = "none"): void => {
  track.style.transition = transition;
  track.style.transform = offset === 0 ? "" : `translateX(${offset}px)`;
};

/** 움직이는 동안에는 날을 누르지 못하게 한다. 밀려나는 옛 달이나 옆에서 들어오는 새 달의 엉뚱한 날이 골라진다 */
const setAnimating = (track: HTMLElement, isAnimating: boolean): void => {
  track.style.pointerEvents = isAnimating ? "none" : "";
};

/**
 * 달력 칸을 좌우로 밀어 달을 넘긴다(#348). 미는 동안 칸이 손가락을 따라오고, 손을 떼면 `decideMonthSwipe` 기준으로 넘기거나 제자리로 돌아온다.
 * 세로로 먼저 움직이면 스크롤에 맡기고, 화면 왼쪽 끝 24px에서 시작한 밀기는 사파리의 뒤로 가기 몸짓에 양보한다.
 * 칸은 렌더링 없이 스타일로만 옮겨 손가락을 바로 따라오게 하고, 새 달은 그려진 뒤에 들어오게 한다.
 *
 * @example
 * const { trackRef, swipeHandlers } = useMonthSwipe({ month: shownMonth, onSwipe: (shift) => goToMonth(shiftMonth(shownMonth, shift)) });
 * <div ref={trackRef} className="touch-pan-y" {...swipeHandlers}><MonthGrid ... /></div>
 */
export const useMonthSwipe = ({ month, onSwipe }: UseMonthSwipeParams): MonthSwipe => {
  const trackRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | undefined>(undefined);
  const isAnimatingRef = useRef(false);
  // 밀려난 뒤 새 달이 그려지기를 기다리는 넘기기. 새 달은 이만큼 옆에서 들어온다
  const pendingSlideInRef = useRef<number | undefined>(undefined);
  const timersRef = useRef(new Set<number>());
  const onSwipeRef = useRef(onSwipe);
  useEffect(() => {
    onSwipeRef.current = onSwipe;
  });
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const later = (callback: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, ms);
    timersRef.current.add(timer);
  };

  const finishAnimation = (track: HTMLElement) => {
    moveTrack(track, 0, "");
    setAnimating(track, false);
    isAnimatingRef.current = false;
  };

  const slideIn = (track: HTMLElement, fromOffset: number) => {
    moveTrack(track, fromOffset);
    // 옆자리로 옮긴 것을 브라우저가 먼저 반영하게 해, 들어오는 움직임이 그 자리에서 시작하게 한다
    track.getBoundingClientRect();
    moveTrack(track, 0, `transform ${SLIDE_IN_MS}ms ease-out`);
    later(() => finishAnimation(track), SLIDE_IN_MS);
  };

  // 새 달이 화면에 반영되기 직전에 옆자리에서 들여온다. 주소로 읽는 달은 바로 그려지지 않을 수 있어 정해진 시간 대신 달이 바뀐 때를 쓴다
  useLayoutEffect(() => {
    const fromOffset = pendingSlideInRef.current;
    const track = trackRef.current;
    if (fromOffset === undefined || !track) return;
    pendingSlideInRef.current = undefined;
    slideIn(track, fromOffset);
    // slideIn은 렌더링마다 새로 만들지만 하는 일은 같다. 달이 바뀔 때만 들여온다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const commit = (track: HTMLElement, shift: 1 | -1) => {
    // 손을 뗀 때의 달을 기준으로 넘긴다. 밀려나는 사이 머리글 단추로 옮겼어도 한 달 더 건너뛰지 않는다
    const swipeTo = onSwipeRef.current;
    if (isMotionReduced()) {
      moveTrack(track, 0);
      swipeTo(shift);
      return;
    }
    isAnimatingRef.current = true;
    setAnimating(track, true);
    // 바깥 여백까지 넓힌 감싸개 폭만큼 밀어야 옛 달이 화면 끝에 남지 않는다
    const width = track.parentElement?.clientWidth ?? track.offsetWidth;
    moveTrack(track, -shift * width, `transform ${SLIDE_OUT_MS}ms ease-in`);
    later(() => {
      pendingSlideInRef.current = shift * width * SLIDE_IN_FROM_RATIO;
      swipeTo(shift);
      later(() => {
        if (pendingSlideInRef.current === undefined) return;
        pendingSlideInRef.current = undefined;
        finishAnimation(track);
      }, SLIDE_IN_FALLBACK_MS);
    }, SLIDE_OUT_MS);
  };

  const snapBack = (track: HTMLElement) => {
    if (isMotionReduced()) {
      moveTrack(track, 0, "");
      return;
    }
    isAnimatingRef.current = true;
    setAnimating(track, true);
    moveTrack(track, 0, `transform ${SLIDE_IN_MS}ms ease-out`);
    later(() => finishAnimation(track), SLIDE_IN_MS);
  };

  // 새 손가락이 누르면 지난 밀기는 버린다. 마우스를 칸 밖에서 떼면 끝 알림이 오지 않아 남아 있을 수 있다
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    gestureRef.current = undefined;
    if (isAnimatingRef.current || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isBackGestureEdge(event.clientX)) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: "undecided",
      dx: 0,
      samples: [{ x: event.clientX, time: event.timeStamp }],
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const track = trackRef.current;
    if (!gesture || !track || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    gesture.samples = addSwipeSample(gesture.samples, { x: event.clientX, time: event.timeStamp });
    if (gesture.axis === "undecided") {
      gesture.axis = getSwipeAxis({ dx, dy: event.clientY - gesture.startY });
      if (gesture.axis === "vertical") {
        gestureRef.current = undefined;
        return;
      }
      if (gesture.axis === "undecided") return;
      // 칸 밖으로 손가락이 나가도 계속 따라오게 한다
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    gesture.dx = dx;
    moveTrack(track, dx);
  };

  const finishGesture = (event: PointerEvent<HTMLDivElement>, isCancelled: boolean) => {
    const gesture = gestureRef.current;
    const track = trackRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = undefined;
    // 가로로 민 손가락은 칸에 붙잡아 두어(setPointerCapture) 날 단추에 누름이 가지 않는다
    if (!track || gesture.axis !== "horizontal") return;
    const samples = addSwipeSample(gesture.samples, { x: event.clientX, time: event.timeStamp });
    const shift = isCancelled ? 0 : decideMonthSwipe({ dx: gesture.dx, width: track.offsetWidth, velocity: getSwipeVelocity(samples) });
    if (shift === 0) snapBack(track);
    else commit(track, shift);
  };

  return {
    trackRef,
    swipeHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: (event) => finishGesture(event, false),
      onPointerCancel: (event) => finishGesture(event, true),
    },
  };
};
