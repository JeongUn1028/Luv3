"use client";

import { useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { FieldError, FieldLabel, FIELD_BOX_CLASS_NAME } from "@/components/FormField";
import { SearchIcon } from "@/components/icons";
import { SESSION_LOST_EVENT } from "@/lib/auth/session-lost";
import { PLACE_MAX_LENGTH } from "@/lib/dates/form";
import { countChars } from "@/lib/form";
import { PLACE_SEARCH_PATH, PlaceSearchError, parsePlaceResults, type PlaceLocation, type PlaceResult } from "@/lib/places/search";

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

const UNAUTHORIZED_STATUS = 401;
const OVER_LIMIT_STATUS = 429;

const fetchPlaces = async (query: string): Promise<PlaceResult[]> => {
  const response = await fetch(`${PLACE_SEARCH_PATH}?${new URLSearchParams({ q: query }).toString()}`);
  // 로그인이 풀리면 서버가 로그인 화면으로 보내고, fetch는 그 화면을 성공(200)으로 받아 온다
  if (response.redirected) throw new PlaceSearchError({ status: UNAUTHORIZED_STATUS });
  if (!response.ok) throw new PlaceSearchError({ status: response.status });
  return parsePlaceResults(await response.json());
};

const toSearchFailureNotice = (error: unknown): string => {
  const status = error instanceof PlaceSearchError ? error.status : undefined;
  if (status === UNAUTHORIZED_STATUS) return "로그인한 뒤 다시 찾아 주세요.";
  if (status === OVER_LIMIT_STATUS) return "오늘은 장소를 더 찾을 수 없어요. 적은 이름 그대로 저장할 수 있어요.";
  return "장소를 찾지 못했어요. 적은 이름 그대로 저장할 수 있어요.";
};

/**
 * 기록의 장소 칸. 이름을 그대로 적어도 되고, 돋보기로 찾아 고르면 지도에 표시할 좌표도 함께 남는다.
 * 돋보기는 칸 안에 두어 평소 칸 높이가 그대로다. 빈 작성 화면에 스크롤이 생기면 안 된다(#52).
 *
 * @example <PlaceField value="" location={undefined} error={undefined} isDisabled={false} canSearch onChange={set} onSelect={select} onClearLocation={clear} />
 */
export const PlaceField = ({ value, location, error, isDisabled, canSearch, labelAction, onChange, onSelect, onClearLocation }: PlaceFieldProps): ReactElement => {
  const [results, setResults] = useState<PlaceResult[] | undefined>();
  const [notice, setNotice] = useState("");
  // 늦게 온 응답이 그 뒤에 고친 글자의 결과를 덮지 않게, 마지막 요청만 받는다
  const latestSearch = useRef(0);

  const closeResults = () => {
    latestSearch.current += 1;
    setResults(undefined);
    setNotice("");
  };

  const handleSearch = async () => {
    const query = value.trim();
    closeResults();
    if (query === "") {
      setNotice("찾을 장소를 적어 주세요.");
      return;
    }
    if (countChars(query) > PLACE_MAX_LENGTH) {
      setNotice(`장소는 ${PLACE_MAX_LENGTH}자까지 적을 수 있어요.`);
      return;
    }

    const search = latestSearch.current;
    setNotice("찾는 중…");
    try {
      const places = await fetchPlaces(query);
      if (search !== latestSearch.current) return;
      setResults(places);
      setNotice(places.length > 0 ? "" : "찾은 장소가 없어요. 적은 이름 그대로 저장할 수 있어요.");
    } catch (error) {
      if (search !== latestSearch.current) return;
      setNotice(toSearchFailureNotice(error));
      // 적어 둔 내용을 잃지 않게 이 자리에서 다시 로그인하는 창을 띄운다
      if (error instanceof PlaceSearchError && error.status === UNAUTHORIZED_STATUS) window.dispatchEvent(new Event(SESSION_LOST_EVENT));
    }
  };

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
        <ul aria-label="찾은 장소" className="mt-2 flex flex-col overflow-hidden rounded-[10px] border border-line bg-surface">
          {results.map((place) => (
            <li key={place.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  closeResults();
                  onSelect(place);
                }}
                className="press-card flex min-h-11 w-full flex-col justify-center px-4 py-2 text-left disabled:opacity-50"
              >
                <span className="text-[15px] break-words text-ink">{place.name}</span>
                {place.address && <span className="text-[12px] break-words text-ink-sub">{place.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
