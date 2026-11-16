"use client";

import type { ReactElement } from "react";
import { TextAreaField } from "@/components/FormField";
import { MEMO_MAX_LENGTH } from "@/lib/dates/form";
import { countChars } from "@/lib/form";

interface RecordMemoFieldProps {
  value: string;
  error: string | undefined;
  isDisabled: boolean;
  onChange: (value: string) => void;
}

/**
 * 기록의 정리 글 칸과 글자 수. 폼의 남은 높이를 채운다.
 *
 * @example <RecordMemoField value={draft.memo} error={errors.memo} isDisabled={isSaving} onChange={(value) => updateField("memo", value)} />
 */
export const RecordMemoField = ({ value, error, isDisabled, onChange }: RecordMemoFieldProps): ReactElement => (
  <TextAreaField
    id="memo"
    label="정리 글"
    hint="선택"
    aside={
      <span id="memo-count" className="font-display text-[12px] tracking-[1px] text-ink-sub">
        {countChars(value.trim()).toLocaleString()}/{MEMO_MAX_LENGTH.toLocaleString()}
      </span>
    }
    describedBy="memo-count"
    value={value}
    // 최소 4줄. 남은 공간은 grow로 채우고, 사진·오류 문구로 내용이 길어지면 4줄을 남기고 페이지가 스크롤된다
    rows={4}
    placeholder="오늘 하루를 길게 남겨 두세요"
    disabled={isDisabled}
    error={error}
    onChange={onChange}
    className="grow"
  />
);
