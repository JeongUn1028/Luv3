import type { ReactElement } from "react";
import { HeartLogo } from "@/components/HeartLogo";

interface DdayHeaderProps {
  /** 사귄 날을 1일째로 센 오늘의 날 수 */
  days: number;
}

// 주아 52px 숫자의 높이(약 39px)에 하트 선의 중심선 높이를 맞춘다(사용자가 고른 시안 D4). 하트 도형은 상자 높이의 76%(viewBox y 10~86)만 그려져 상자는 39 / 0.76이다.
// 상자 크기는 아래 `size-[51px]`·`size-[18px]` 클래스와 같이 바꾼다(두께 계산에만 쓴다)
const HEART_BOX_PX = 51;
const HEART_STROKE = 6.5;
const PLUS_BOX_PX = 18;
// 하트 선과 화면에서 같은 두께(6.5 × 51 / 100 ≈ 3.3px)가 되게 `+`의 viewBox(20) 기준 두께를 정한다
const PLUS_STROKE = (HEART_STROKE * HEART_BOX_PX) / 100 / (PLUS_BOX_PX / 20);

/** 하트와 숫자 사이의 `+`. 주아의 `+`는 획이 굵어 선으로 그린 하트와 어울리지 않아 같은 선으로 그린다 */
const PlusLine = (): ReactElement => (
  <svg viewBox="0 0 20 20" className="mx-2 size-[18px] shrink-0 text-highlight" aria-hidden="true" focusable="false">
    <path d="M10 3 V17 M3 10 H17" fill="none" stroke="currentColor" strokeWidth={PLUS_STROKE} strokeLinecap="round" />
  </svg>
);

/**
 * 홈 머리글 가운데의 D-day 한 줄: 하트 + 큰 숫자(#208). 셋의 그려진 모양을 머리글 가운데(설정 아이콘과 같은 높이)에 맞춘다.
 * 상자끼리 가운데를 맞추면 어긋나서 그만큼 내린다: 주아 숫자는 글자 칸 위쪽에 치우쳐 그려지고(가운데보다 약 2.75px 위, #208),
 * 하트는 1px 내린다. 숫자는 글자마다 잉크 높이가 1~2px 달라(어느 숫자가 들었는지와 글자 다듬기에 따라 다르다) 날짜에 따라 가운데가 움직이므로,
 * 그 범위의 가운데에 하트를 맞췄다(#476, `e2e/screen-fit.spec.ts`가 여러 숫자로 잰다)
 */
export const DdayHeader = ({ days }: DdayHeaderProps): ReactElement => (
  <section>
    <h2 className="sr-only">함께한 지 {days}일째</h2>
    <div aria-hidden="true" className="flex items-center justify-center">
      <HeartLogo className="size-[51px] shrink-0 translate-y-[1px] text-highlight" strokeWidth={HEART_STROKE} />
      <PlusLine />
      <p className="translate-y-[2.75px] font-display text-[52px] leading-none text-highlight">{days}</p>
    </div>
  </section>
);
