import type { ReactElement } from "react";
import { ANNIVERSARY_DATE, formatSinceLabel } from "@/lib/anniversary";
import { HeartLogo } from "./HeartLogo";

const SINCE_LABEL = formatSinceLabel(ANNIVERSARY_DATE);
/** 문구 첫 글자가 나타나기 시작하는 시각. 마지막 글자가 0.9초에 끝나도록 간격을 맞췄다(움직임은 globals.css) */
const FIRST_LETTER_DELAY = 580;
const LETTER_INTERVAL = 18.2;

/**
 * 하트 → 가운데 선 → `SINCE` 문구 순서로 한 번 그려지는 로고. 시작 화면(#131)과 로그인 화면(#198)이 함께 쓴다.
 * 화면 코드가 오기 전에도 돌도록 움직임은 CSS로만 한다(globals.css의 `logo-draw-*`).
 * 기기의 "동작 줄이기"가 켜져 있으면 움직이지 않고 완성된 로고를 보여 준다.
 *
 * @example <DrawnLogo />
 */
export const DrawnLogo = (): ReactElement => (
  <div data-drawn-logo className="flex flex-col items-center">
    <HeartLogo isSplit className="logo-draw-heart w-[120px] text-highlight" />
    <div className="logo-draw-line mt-10 h-px w-8 bg-ink-sub" />
    {/* letter-spacing이 마지막 글자 뒤에도 붙어 가운데가 왼쪽으로 쏠리므로 같은 만큼 왼쪽을 띄운다.
        글자마다 나눈 span은 VoiceOver가 한 글자씩 읽으므로 문구 전체를 이름으로 준 한 덩어리로 읽게 한다 */}
    <p role="img" aria-label={SINCE_LABEL} className="mt-5 pl-[6px] font-logo text-[14px] tracking-[6px] text-label">
      {[...SINCE_LABEL].map((letter, index) => (
        <span key={index} className="logo-draw-letter" style={{ animationDelay: `${FIRST_LETTER_DELAY + index * LETTER_INTERVAL}ms` }}>
          {letter}
        </span>
      ))}
    </p>
  </div>
);
