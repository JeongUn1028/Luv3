"use client";

import { useEffect, useState, type RefObject } from "react";
import { useFirstPhotoGate } from "@/components/dates/FirstPhotoGate";
import { findScrollParent } from "@/lib/scroll-parent";

/** 지도가 화면에 들어오기 전 이만큼 가까워지면 부르기 시작한다. 화면 반쯤이라 내려서 닿을 때는 대개 다 그려져 있다 */
const NEAR_DISTANCE_PX = 400;
/** 첫 사진을 받지 못해도(끊김·만료) 지도가 "불러오는 중"에 머물지 않게 이만큼 기다린 뒤 부른다 */
const FIRST_PHOTO_WAIT_MS = 4_000;

/**
 * 기록 상세의 동선 지도를 불러올 때인지(#313). 지도 자리가 화면에 가까워지고, 첫 사진을 다 받았을 때 true가 된다.
 * 글이 짧은 기록은 지도가 처음부터 화면 안이라 거리만 보면 첫 사진과 회선을 나눠 쓰므로 사진도 기다린다. 한 번 true가 되면 그대로다.
 *
 * @example const shouldLoad = useRouteMapStart(sectionRef)
 */
export const useRouteMapStart = (targetRef: RefObject<HTMLElement | null>): boolean => {
  const { isFirstPhotoShown } = useFirstPhotoGate();
  const [isNear, setIsNear] = useState(false);
  const [hasWaitedForPhoto, setHasWaitedForPhoto] = useState(false);

  // 스크롤 영역(외부 시스템)에서 지도 자리까지의 거리를 지켜본다
  useEffect(() => {
    const target = targetRef.current;
    if (isNear || !target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setIsNear(true);
      },
      { root: findScrollParent(target), rootMargin: `${NEAR_DISTANCE_PX}px 0px` },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef, isNear]);

  useEffect(() => {
    if (!isNear || isFirstPhotoShown) return;
    const timer = window.setTimeout(() => setHasWaitedForPhoto(true), FIRST_PHOTO_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [isNear, isFirstPhotoShown]);

  return isNear && (isFirstPhotoShown || hasWaitedForPhoto);
};
