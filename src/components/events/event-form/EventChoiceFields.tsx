"use client";

import type { ReactElement } from "react";
import { FIELD_LABEL_CLASS_NAME } from "@/components/FormField";
import { getEventKinds, getHighlightClassNames } from "@/lib/calendar/highlight";
import type { EventEditScope } from "@/lib/events/form";

const CHOICE_CLASS_NAME =
  "flex h-[51px] min-w-0 items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[15px] text-ink-sub has-checked:border-accent has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-accent has-disabled:opacity-50";

const EDIT_SCOPES: { scope: EventEditScope; label: string }[] = [
  { scope: "occurrence", label: "이 날만" },
  { scope: "all", label: "전체" },
];

interface EventScopeFieldProps {
  scope: EventEditScope;
  isDisabled: boolean;
  onChange: (scope: EventEditScope) => void;
}

/**
 * 반복 일정에서 고칠 범위("이 날만 / 전체")를 고르는 칸.
 *
 * @example <EventScopeField scope={draft.scope} isDisabled={isSaving} onChange={changeScope} />
 */
export const EventScopeField = ({ scope: checkedScope, isDisabled, onChange }: EventScopeFieldProps): ReactElement => (
  <fieldset className="flex flex-col">
    <legend className={FIELD_LABEL_CLASS_NAME}>고칠 범위</legend>
    <div className="mt-2 grid grid-cols-2 gap-2">
      {EDIT_SCOPES.map(({ scope, label }) => (
        <label key={scope} className={CHOICE_CLASS_NAME}>
          <input
            type="radio"
            name="event-scope"
            checked={checkedScope === scope}
            disabled={isDisabled}
            onChange={() => onChange(scope)}
            className="sr-only"
          />
          {label}
        </label>
      ))}
    </div>
  </fieldset>
);

interface EventKindFieldProps {
  /** 함께 일정이 아닐 때 선택지에 쓰는 닉네임 */
  ownerNickname: string;
  isTogether: boolean;
  isDisabled: boolean;
  onChange: (isTogether: boolean) => void;
}

/**
 * 누구 일정인지(함께 / 한 사람) 고르는 칸.
 *
 * @example <EventKindField ownerNickname="지은" isTogether={draft.isTogether} isDisabled={isSaving} onChange={setIsTogether} />
 */
export const EventKindField = ({ ownerNickname, isTogether: checkedIsTogether, isDisabled, onChange }: EventKindFieldProps): ReactElement => (
  <fieldset className="flex flex-col">
    <legend className={FIELD_LABEL_CLASS_NAME}>누구 일정</legend>
    <div className="mt-2 grid grid-cols-2 gap-2">
      {getEventKinds(ownerNickname).map(({ isTogether, highlight, label }) => (
        <label key={highlight} className={CHOICE_CLASS_NAME}>
          <input
            type="radio"
            name="event-kind"
            checked={checkedIsTogether === isTogether}
            disabled={isDisabled}
            onChange={() => onChange(isTogether)}
            className="sr-only"
          />
          {/* 캘린더 형광펜과 같은 색 띠로, 고른 종류가 캘린더에서 어떤 색으로 보일지 알려 준다 */}
          <span
            aria-hidden="true"
            className={`h-2.5 w-4 shrink-0 -rotate-2 rounded-[2px] ${getHighlightClassNames({ highlight, isCurrentMonth: true }).band}`}
          />
          <span className="truncate">{label}</span>
        </label>
      ))}
    </div>
  </fieldset>
);
