"use client";

import { useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactElement, type Ref, type RefObject } from "react";
import { FieldLabel, FIELD_BOX_CLASS_NAME } from "@/components/FormField";
import { SearchIcon } from "@/components/icons";
import { ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import { isSamePhotoLocation, PLACE_MAX_LENGTH, takeChars, type PhotoLocation } from "@/lib/dates/form";
import { PlaceResultList } from "./PlaceResultList";
import { usePlaceSearch } from "./use-place-search";

/** 창을 여닫는 기능. 열 때 초점을 찾기 칸이 아닌 창 내용에 둔다 */
export interface PhotoLocationDialogHandle {
  open: () => void;
  close: () => void;
}

interface PhotoLocationDialogProps {
  ref: Ref<PhotoLocationDialogHandle>;
  /** 고치는 사진이 몇 번째인지(1부터). 창 제목에 쓴다 */
  photoNumber: number;
  location: PhotoLocation | undefined;
  /** 바로 앞 사진의 위치. 있으면 "앞 사진과 같은 곳"으로 고를 수 있다 */
  previousLocation: PhotoLocation | undefined;
  /** 장소 찾기를 쓸 수 있는지(서버에 키가 있는지) */
  canSearch: boolean;
  /** 고르거나 지우면 창을 닫고, 다 닫힌 뒤 부른다 */
  onChange: (location: PhotoLocation | undefined) => void;
}

const QUERY_ID = "photo-place-query";

const applyPendingChange = (pendingRef: RefObject<(() => void) | undefined>): void => {
  const apply = pendingRef.current;
  pendingRef.current = undefined;
  apply?.();
};

const optionButtonClassName =
  "press-wide flex min-h-[51px] w-full flex-col items-center justify-center rounded-[10px] border border-line px-4 py-2 text-[15px] text-ink hover:bg-background";

/**
 * 사진 한 장의 위치를 고르는 창(#249). 장소를 찾아 고르거나, 바로 앞 사진과 같은 곳으로 두거나, 위치를 지운다.
 * 사진 줄에는 위치 한 줄만 두고 고르는 일은 여기서 해 사진 10장을 골라도 폼이 크게 길어지지 않는다.
 *
 * @example <PhotoLocationDialog ref={dialogRef} photoNumber={2} location={undefined} previousLocation={first} canSearch onChange={save} />
 */
export const PhotoLocationDialog = ({ ref, photoNumber, location, previousLocation, canSearch, onChange }: PhotoLocationDialogProps): ReactElement => {
  const modalRef = useRef<ModalDialogHandle>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // 고른 값은 창이 다 닫힌 뒤에 넘긴다. 닫히는 움직임 동안 제목·설명·버튼이 새 값으로 바뀌어 보이지 않게 한다
  const pendingChangeRef = useRef<() => void>(undefined);
  const [query, setQuery] = useState("");
  const { results, notice, search, close: closeResults } = usePlaceSearch({ maxLength: PLACE_MAX_LENGTH });
  const canUsePrevious = previousLocation !== undefined && !isSamePhotoLocation(previousLocation, location);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        // 닫히는 중에 다시 열면 onClose가 오지 않으므로 앞에서 고른 값을 여기서 넘긴다
        applyPendingChange(pendingChangeRef);
        modalRef.current?.open();
        // 창은 열릴 때 첫 칸(찾기 칸)에 초점을 준다. 아이폰은 그때 키보드를 올려 "앞 사진과 같은 곳"을 가리므로 내용 묶음으로 옮긴다
        contentRef.current?.focus();
      },
      close: () => modalRef.current?.close(),
    }),
    [],
  );

  const choose = (nextLocation: PhotoLocation | undefined) => {
    // 고를 때의 onChange(그때 연 사진)를 그대로 남겨, 닫히는 사이 다른 사진으로 다시 열어도 고른 사진에 들어가게 한다
    pendingChangeRef.current = () => onChange(nextLocation);
    modalRef.current?.close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 창이 기록 폼 안에 있어 Enter가 기록 저장이 되지 않게 막는다. 받침을 쓰는 중에 누른 Enter는 글자를 끝내는 키다
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!event.nativeEvent.isComposing) void search(query);
  };

  return (
    <ModalDialog
      ref={modalRef}
      title={`${photoNumber}번째 사진 위치`}
      description={location ? `지금: ${location.place}` : "아직 위치가 없어요."}
      shouldCloseOnOutsideClick
      // 고르면 바로 값이 바뀌므로, 위치 줄을 두 번 누른 두 번째가 창 안의 버튼에 닿지 않게 한다
      shouldGuardDoubleTap
      onClose={() => {
        // 다음에 열 때는 다른 사진일 수 있어 찾던 내용을 남기지 않는다
        setQuery("");
        closeResults();
        applyPendingChange(pendingChangeRef);
      }}
    >
      <div ref={contentRef} tabIndex={-1} className="mt-4 flex flex-col outline-none">
        {canSearch ? (
          <>
            <FieldLabel htmlFor={QUERY_ID} label="장소 찾기" />
            <div className="relative mt-2">
              <input
                id={QUERY_ID}
                value={query}
                placeholder="가게·공원 이름"
                maxLength={PLACE_MAX_LENGTH * 2}
                enterKeyHint="search"
                onChange={(event) => {
                  closeResults();
                  setQuery(event.target.value);
                }}
                onKeyDown={handleKeyDown}
                className={`w-full pr-12 pl-4 ${FIELD_BOX_CLASS_NAME}`}
              />
              <button
                type="button"
                aria-label="사진 장소 찾기"
                onClick={() => void search(query)}
                className="press-icon absolute top-1 right-1 flex size-11 items-center justify-center text-ink-sub"
              >
                <SearchIcon className="size-5" />
              </button>
            </div>
            <p role="status" className="mt-2 text-[12px] text-ink-sub empty:mt-0">
              {notice}
            </p>
            {results && results.length > 0 && (
              <PlaceResultList
                label="찾은 사진 장소"
                results={results}
                onSelect={(place) => choose({ place: takeChars(place.name, PLACE_MAX_LENGTH), lat: place.lat, lng: place.lng })}
              />
            )}
          </>
        ) : (
          <p className="text-[13px] text-ink-sub">지금은 장소를 찾을 수 없어요.</p>
        )}

        {(canUsePrevious || location) && (
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            {canUsePrevious && (
              <button type="button" onClick={() => choose(previousLocation)} className={optionButtonClassName}>
                앞 사진과 같은 곳
                <span className="text-[12px] break-words text-ink-sub">{previousLocation.place}</span>
              </button>
            )}
            {location && (
              <button type="button" onClick={() => choose(undefined)} className="press-icon min-h-11 text-[13px] text-ink-sub underline">
                위치 지우기
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => modalRef.current?.close()}
          className="press-wide mt-4 h-12 w-full rounded-[10px] border border-line text-[15px] text-ink hover:bg-background"
        >
          닫기
        </button>
      </div>
    </ModalDialog>
  );
};
