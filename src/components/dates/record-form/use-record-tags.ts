"use client";

import { useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import type { DraftErrors } from "@/lib/dates/form";
import { addTag } from "@/lib/dates/tags";
import { clearError } from "@/lib/form";
import type { RecordDraft } from "./record-draft";

interface UseRecordTagsParams {
  draft: RecordDraft;
  setDraft: Dispatch<SetStateAction<RecordDraft>>;
  setErrors: Dispatch<SetStateAction<DraftErrors>>;
}

interface RecordTags {
  /** 적고 있는 태그 글자 */
  tagInput: string;
  setTagInput: Dispatch<SetStateAction<string>>;
  isTagFieldOpen: boolean;
  tagInputRef: RefObject<HTMLInputElement | null>;
  /** "태그 추가"를 누르면 칸을 열고 바로 초점을 준다 */
  handleOpenTagField: () => void;
  handleTagInputChange: (value: string) => void;
  handleAddTag: (text: string) => void;
  handleRemoveTag: (tag: string) => void;
  /** 폼을 처음부터 다시 쓸 때 부른다. 태그가 있는 기록이면 칸을 열어 둔다 */
  resetTags: (tags: string[]) => void;
}

/**
 * 기록 폼의 태그 칸 상태(#20). 칸을 늘 열어 두면 빈 작성 화면에 스크롤이 생기므로(#52) 태그가 있는 기록만 열어 둔다.
 *
 * @example const recordTags = useRecordTags({ draft, setDraft, setErrors })
 */
export const useRecordTags = ({ draft, setDraft, setErrors }: UseRecordTagsParams): RecordTags => {
  const [tagInput, setTagInput] = useState("");
  const [isTagFieldOpen, setIsTagFieldOpen] = useState(draft.tags.length > 0);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const handleOpenTagField = () => {
    // iOS는 누르는 동작 안에서 초점을 줘야 키보드를 연다. 칸을 먼저 그려야 초점을 줄 수 있다
    flushSync(() => setIsTagFieldOpen(true));
    tagInputRef.current?.focus();
  };

  const handleTagInputChange = (value: string) => {
    setTagInput(value);
    setErrors((current) => clearError(current, "tags"));
  };

  const handleAddTag = (text: string) => {
    const { tags, error } = addTag(draft.tags, text);
    setDraft((current) => ({ ...current, tags }));
    setErrors((current) => (error ? { ...current, tags: error } : clearError(current, "tags")));
    // 전에 쓴 태그를 눌렀을 때는 적던 글자를 그대로 둔다
    if (!error && text === tagInput) setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setDraft((current) => ({ ...current, tags: current.tags.filter((existing) => existing !== tag) }));
    setErrors((current) => clearError(current, "tags"));
  };

  const resetTags = (tags: string[]) => {
    setTagInput("");
    setIsTagFieldOpen(tags.length > 0);
  };

  return { tagInput, setTagInput, isTagFieldOpen, tagInputRef, handleOpenTagField, handleTagInputChange, handleAddTag, handleRemoveTag, resetTags };
};
