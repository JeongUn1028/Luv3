import type { ReactElement } from "react";
import { HeartLogo } from "@/components/HeartLogo";

interface DdayHeaderProps {
  /** 사귄 날을 1일째로 센 오늘의 날 수 */
  days: number;
  /** `SINCE YYMMDD` 표기 */
  sinceLabel: string;
}

/** 홈 맨 위의 D-day(home.svg): 작은 하트, SINCE 날짜, 큰 숫자, DAYS. */
export const DdayHeader = ({ days, sinceLabel }: DdayHeaderProps): ReactElement => (
  <section className="flex flex-col items-center pt-3 pb-2">
    <h2 className="sr-only">함께한 지 {days}일째</h2>
    <div aria-hidden="true" className="flex flex-col items-center">
      <HeartLogo className="w-[30px] text-highlight" strokeWidth={4} />
      {/* letter-spacing이 마지막 글자 뒤에도 붙어 가운데가 왼쪽으로 쏠리므로 같은 만큼 왼쪽을 띄운다 */}
      <p className="mt-[10px] pl-[4px] font-display text-[11px] font-semibold tracking-[4px] text-ink-sub">{sinceLabel}</p>
      <p className="mt-3 font-display text-[52px] leading-none font-medium text-highlight">{days}</p>
      <p className="mt-2 pl-[4px] font-display text-[12px] font-semibold tracking-[4px] text-ink-sub">DAYS</p>
    </div>
  </section>
);
