"use client";

import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { FieldError, FieldLabel, FIELD_BOX_CLASS_NAME } from "@/components/FormField";
import { SearchIcon } from "@/components/icons";
import { PLACE_MAX_LENGTH } from "@/lib/dates/form";
import type { PlaceLocation, PlaceResult } from "@/lib/places/search";
import { PlaceResultList } from "./PlaceResultList";
import { usePlaceSearch } from "./use-place-search";

interface PlaceFieldProps {
  value: string;
  /** 지도에 표시할 좌표. 찾아서 고른 장소에만 있다 */
  location: PlaceLocation | undefined;
  error: string | undefined;
  isDisabled: boolean;
  /** 장소 찾기를 쓸 수 있는지(서버에 키가 있는지) */
  canSearch: boolean;
  /** 라벨 줄 오른쪽에 놓을 것 */
  labelAction?: ReactNode;
  onChange: (value: string) => void;
  onSelect: (place: PlaceResult) => void;
  onClearLocation: () => void;
}

/**
 * 기록의 장소 칸. 이름을 그대로 적어도 되고, 돋보기로 찾아 고르면 지도에 표시할 좌표도 함께 남는다.
 * 돋보기는 칸 안에 두어 평소 칸 높이가 그대로다. 빈 작성 화면에 스크롤이 생기면 안 된다(#52).
 *
 * @example <PlaceField value="" location={undefined} error={undefined} isDisabled={false} canSearch onChange={set} onSelect={select} onClearLocation={clear} />
 */
export const PlaceField = ({ value, location, error, isDisabled, canSearch, labelAction, onChange, onSelect, onClearLocation }: PlaceFieldProps): ReactElement => {
  const { results, notice, search, close: closeResults } = usePlaceSearch({
    maxLength: PLACE_MAX_LENGTH,
    fallbackHint: " 적은 이름 그대로 저장할 수 있어요.",
  });
  const handleSearch = () => search(value);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 칸 안에 돋보기가 있으면 Enter는 저장이 아니라 찾기다. 받침을 쓰는 중에 누른 Enter는 글자를 끝내는 키다
    if (!canSearch || event.key !== "Enter") return;
    event.preventDefault();
    if (!event.nativeEvent.isComposing) void handleSearch();
  };

  return (
    <div className="flex flex-col">
      <FieldLabel htmlFor="place" label="장소" hint="선택" aside={labelAction} />
      <div className="relative mt-2">
        <input
          id="place"
          value={value}
          placeholder="성수동"
          maxLength={PLACE_MAX_LENGTH * 2}
          disabled={isDisabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "place-error" : undefined}
          onChange={(event) => {
            closeResults();
            onChange(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          className={`w-full pl-4 ${FIELD_BOX_CLASS_NAME} ${canSearch ? "pr-12" : "pr-4"}`}
        />
        {canSearch && (
          <button
            type="button"
            aria-label="장소 찾기"
            disabled={isDisabled}
            onClick={() => void handleSearch()}
            className="press-icon absolute top-1 right-1 flex size-11 items-center justify-center text-ink-sub disabled:opacity-50"
          >
            <SearchIcon className="size-5" />
          </button>
        )}
      </div>
      <FieldError id="place-error" error={error} />
      {location && (
        <p className="mt-2 flex items-center justify-between text-[12px] text-ink-sub">
          지도에 표시되는 장소예요
          <button
            type="button"
            disabled={isDisabled}
            onClick={onClearLocation}
            // 글자 줄만큼만 차지하면서 44px을 누를 수 있게 넓힌다
            className="press-icon relative after:absolute after:inset-x-0 after:-inset-y-[13px] disabled:opacity-50"
          >
            위치 지우기
          </button>
        </p>
      )}
      <p role="status" className="mt-2 text-[12px] text-ink-sub empty:mt-0">
        {notice}
      </p>
      {results && results.length > 0 && (
        <PlaceResultList
          label="찾은 장소"
          results={results}
          isDisabled={isDisabled}
          onSelect={(place) => {
            closeResults();
            onSelect(place);
          }}
        />
      )}
    </div>
  );
};
