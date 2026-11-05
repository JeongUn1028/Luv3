import type { ReactElement } from "react";
import { HeartLogo } from "@/components/HeartLogo";

interface DdayHeaderProps {
  /** 사귄 날을 1일째로 센 오늘의 날 수 */
  days: number;
}

/** 홈 머리글 가운데의 D-day 한 줄: 하트, 큰 숫자, DAYS. 하트와 DAYS는 글자 아랫선에 맞춘다 */
export const DdayHeader = ({ days }: DdayHeaderProps): ReactElement => (
  <section>
    <h2 className="sr-only">함께한 지 {days}일째</h2>
    <div aria-hidden="true" className="flex items-baseline justify-center gap-3">
      {/* 숫자는 모양마다 높이가 달라 변하지 않는 글자 아랫선에 맞춘다. 이미지 아래 여백(3.6px)만큼 내려 그려진 선을 맞춘다 */}
      <HeartLogo className="size-[30px] translate-y-[3.6px] text-highlight" strokeWidth={4} />
      <p className="font-display text-[52px] leading-none font-medium text-highlight">{days}</p>
      {/* letter-spacing이 마지막 글자 뒤에도 붙어 가운데가 왼쪽으로 쏠리므로 그만큼 오른쪽 자리를 없앤다 */}
      <p className="-mr-1 font-display text-[12px] font-semibold tracking-[4px] text-ink-sub">DAYS</p>
    </div>
  </section>
);
