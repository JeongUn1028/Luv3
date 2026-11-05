"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { ANNIVERSARY_DATE, formatSinceLabel } from "@/lib/anniversary";
import { HeartLogo } from "./HeartLogo";

const SINCE_LABEL = formatSinceLabel(ANNIVERSARY_DATE);
/** 문구 첫 글자가 나타나기 시작하는 시각. 마지막 글자가 0.9초에 끝나도록 간격을 맞췄다(움직임은 globals.css) */
const FIRST_LETTER_DELAY = 580;
const LETTER_INTERVAL = 18.2;

/**
 * 앱을 켤 때 하트를 그리는 시작 화면(#131). 아이폰의 시작 이미지는 움직일 수 없어 앱 첫 화면 위에서 그린다.
 * 화면 코드가 오기 전에도 돌도록 움직임은 CSS로만 하고, 여기서는 끝난 뒤 화면에서 없애기만 한다.
 *
 * @example <StartupSplash />
 */
export const StartupSplash = (): ReactElement | undefined => {
  const splashRef = useRef<HTMLDivElement>(null);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    // 화면 코드가 늦게 오면 이미 끝나 있을 수 있고, 움직이지 않는 설정이면 기다릴 움직임이 없다. 두 경우 모두 바로 없앤다
    const animations = splashRef.current?.getAnimations() ?? [];
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => setIsFinished(true));
  }, []);

  if (isFinished) return undefined;

  return (
    <div
      ref={splashRef}
      data-startup-splash
      aria-hidden="true"
      // 틀과 같은 h-app을 쓴다. 홈 화면 앱을 처음 띄우면 fixed + inset-0은 화면보다 짧게 잡힌다(globals.css의 --app-height)
      className="pointer-events-none fixed top-0 left-0 z-20 flex h-app w-full flex-col items-center justify-center bg-background"
      // 앱 안에서 옮겨 온 문서이면 React보다 먼저 스크립트가 숨긴다(SKIP_STARTUP_SPLASH_SCRIPT)
      suppressHydrationWarning
    >
      <HeartLogo isSplit className="w-[120px] text-highlight" />
      <div className="mt-10 h-px w-8 bg-ink-sub" />
      {/* letter-spacing이 마지막 글자 뒤에도 붙어 가운데가 왼쪽으로 쏠리므로 같은 만큼 왼쪽을 띄운다 */}
      <p className="mt-5 pl-[6px] font-logo text-[14px] tracking-[6px] text-label">
        {[...SINCE_LABEL].map((letter, index) => (
          <span key={index} style={{ animationDelay: `${FIRST_LETTER_DELAY + index * LETTER_INTERVAL}ms` }}>
            {letter}
          </span>
        ))}
      </p>
    </div>
  );
};
