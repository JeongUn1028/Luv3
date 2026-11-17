"use client";

import type { MouseEvent, ReactElement } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from "@/components/icons";
import { clampMonth, type DateBounds } from "@/lib/calendar/date-picker";
import { formatMonthTitle, shiftMonth } from "@/lib/calendar/month";

const MONTH_BUTTONS = [
  { label: "이전 해", offset: -12, Icon: ChevronsLeftIcon },
  { label: "이전 달", offset: -1, Icon: ChevronLeftIcon },
  { label: "다음 달", offset: 1, Icon: ChevronRightIcon },
  { label: "다음 해", offset: 12, Icon: ChevronsRightIcon },
] as const;

interface PickerMonthNavProps {
  /** 보고 있는 달 YYYY-MM */
  month: string;
  bounds: DateBounds;
  onShowMonth: (event: MouseEvent<HTMLButtonElement>, month: string) => void;
}

/**
 * 날짜 선택 창 위쪽 줄: 보고 있는 달 + 해·달을 넘기는 버튼 네 개.
 *
 * @example <PickerMonthNav month="2026-11" bounds={{ max: today }} onShowMonth={handleShowMonth} />
 */
export const PickerMonthNav = ({ month, bounds, onShowMonth }: PickerMonthNavProps): ReactElement => (
  <div className="flex items-center justify-between">
    <p aria-live="polite" className="font-display text-[15px] tracking-[2px] text-label">
      {formatMonthTitle(month)}
    </p>
    <div className="flex items-center">
      {MONTH_BUTTONS.map(({ label, offset, Icon }) => {
        // 범위를 넘으면 범위 안의 끝 달로 옮긴다. 옮길 달이 없을 때만 막는다
        const targetMonth = clampMonth(shiftMonth(month, offset), bounds);
        return (
          <button
            key={label}
            type="button"
            aria-label={label}
            disabled={targetMonth === month}
            onClick={(event) => onShowMonth(event, targetMonth)}
            className="press-icon flex size-11 items-center justify-center text-ink-sub hover:text-ink disabled:opacity-30"
          >
            <Icon className="size-5" />
          </button>
        );
      })}
    </div>
  </div>
);
