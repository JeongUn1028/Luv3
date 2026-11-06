import type { KeyboardEvent, ReactElement, RefObject } from "react";
import { MAX_TAGS, TAG_MAX_LENGTH, pickTagSuggestions } from "@/lib/dates/form";

interface TagFieldProps {
  /** 칸을 열 때 초점을 주려고 입력 칸을 넘겨받는다 */
  inputRef: RefObject<HTMLInputElement | null>;
  tags: string[];
  /** 전에 쓴 태그(많이 쓴 순). 이미 붙인 태그는 빼고 보여 준다 */
  suggestions: string[];
  /** 적고 있는 글자 */
  input: string;
  error: string | undefined;
  isDisabled: boolean;
  onInputChange: (value: string) => void;
  onAdd: (text: string) => void;
  onRemove: (tag: string) => void;
}

// 44px 누름 영역을 위아래로 넓히고 한 글자 태그도 가로 44px을 지켜, 작게 그린 태그도 쉽게 누른다. 줄 사이는 넓힌 영역이 겹치지 않게 벌린다.
// 넓히는 기준이 테두리 안쪽이라 테두리가 있는 태그는 그 두께만큼 더 넓힌다
const chipClassName =
  "relative flex h-[26px] min-w-11 items-center justify-center rounded-[4px] px-2 text-[13px] after:absolute disabled:opacity-50";

/**
 * 기록의 태그 칸. 글자를 적어 더하거나 전에 쓴 태그를 눌러 더한다.
 *
 * @example <TagField inputRef={ref} tags={tags} suggestions={[]} input="" error={undefined} isDisabled={false} onInputChange={setInput} onAdd={add} onRemove={remove} />
 */
export const TagField = ({ inputRef, tags, suggestions, input, error, isDisabled, onInputChange, onAdd, onRemove }: TagFieldProps): ReactElement => {
  const remaining = pickTagSuggestions(suggestions, tags);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 받침을 쓰는 중에 누른 Enter는 글자를 끝내는 키다. 폼 저장으로도 이어지지 않게 막는다
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!event.nativeEvent.isComposing) onAdd(input);
  };

  return (
    <div className="flex flex-col">
      <label htmlFor="tag-input" className="text-[13px] text-ink-sub">
        태그 <span className="text-ink-placeholder">(선택, {MAX_TAGS}개까지)</span>
      </label>
      <div className="mt-2 flex gap-2">
        <input
          ref={inputRef}
          id="tag-input"
          value={input}
          placeholder="카페"
          // 앞의 #과 공백을 지운 뒤에 글자 수를 재므로 입력은 넉넉하게 받는다
          maxLength={TAG_MAX_LENGTH * 2}
          enterKeyHint="done"
          disabled={isDisabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "tag-error" : undefined}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="h-[51px] min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-4 text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent"
        />
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => onAdd(input)}
          className="h-[51px] shrink-0 rounded-[10px] border border-line px-4 text-[15px] text-ink disabled:opacity-50"
        >
          추가
        </button>
      </div>
      {error && (
        <p id="tag-error" className="mt-2 text-[12px] text-accent">
          {error}
        </p>
      )}
      {tags.length > 0 && (
        <ul aria-label="붙인 태그" className="mt-[18px] flex flex-wrap gap-x-1.5 gap-y-[18px]">
          {tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                disabled={isDisabled}
                aria-label={`${tag} 태그 빼기`}
                onClick={() => onRemove(tag)}
                className={`${chipClassName} gap-1 bg-highlight/16 text-highlight after:inset-x-0 after:-inset-y-[9px]`}
              >
                {tag}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {remaining.length > 0 && (
        <div className="mt-[18px]">
          <p className="text-[12px] text-ink-sub">전에 쓴 태그</p>
          <ul aria-label="전에 쓴 태그" className="mt-[18px] flex flex-wrap gap-x-1.5 gap-y-[18px]">
            {remaining.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  disabled={isDisabled}
                  aria-label={`${suggestion} 태그 붙이기`}
                  onClick={() => onAdd(suggestion)}
                  className={`${chipClassName} border border-line text-ink-sub after:-inset-x-px after:-inset-y-[10px]`}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
