"use client";

import { useRef, useState } from "react";
import { SESSION_LOST_EVENT } from "@/lib/auth/session-lost";
import { countChars } from "@/lib/form";
import {
  fetchPlaceResults,
  PLACE_SEARCH_UNAUTHORIZED_STATUS,
  PlaceSearchError,
  toPlaceSearchFailureNotice,
  type PlaceResult,
} from "@/lib/places/search";

interface UsePlaceSearchParams {
  /** 찾을 수 있는 글자 수(장소 칸의 제한과 같다) */
  maxLength: number;
  /** 찾지 못했을 때 덧붙일 말. 기록 장소 칸은 적은 이름 그대로 저장할 수 있음을 알린다 */
  fallbackHint?: string;
}

interface PlaceSearch {
  /** 찾은 장소. 찾기 전이거나 닫았으면 undefined */
  results: PlaceResult[] | undefined;
  /** 찾는 중·찾지 못함 같은 안내. 없으면 빈 글자 */
  notice: string;
  search: (text: string) => Promise<void>;
  /** 결과와 안내를 지우고, 아직 오지 않은 응답은 버린다 */
  close: () => void;
}

/**
 * 장소 찾기 상태. 기록 장소 칸(PlaceField)과 사진 위치 창(PhotoLocationDialog)이 함께 쓴다.
 * 로그인이 풀렸으면 적어 둔 내용을 잃지 않게 이 자리에서 다시 로그인하는 창을 띄운다.
 *
 * @example const { results, notice, search, close } = usePlaceSearch({ maxLength: PLACE_MAX_LENGTH });
 */
export const usePlaceSearch = ({ maxLength, fallbackHint = "" }: UsePlaceSearchParams): PlaceSearch => {
  const [results, setResults] = useState<PlaceResult[] | undefined>();
  const [notice, setNotice] = useState("");
  // 늦게 온 응답이 그 뒤에 고친 글자의 결과를 덮지 않게, 마지막 요청만 받는다
  const latestSearch = useRef(0);

  const close = () => {
    latestSearch.current += 1;
    setResults(undefined);
    setNotice("");
  };

  const search = async (text: string) => {
    const query = text.trim();
    close();
    if (query === "") {
      setNotice("찾을 장소를 적어 주세요.");
      return;
    }
    if (countChars(query) > maxLength) {
      setNotice(`장소는 ${maxLength}자까지 적을 수 있어요.`);
      return;
    }

    const searchId = latestSearch.current;
    setNotice("찾는 중…");
    try {
      const places = await fetchPlaceResults({ query });
      if (searchId !== latestSearch.current) return;
      setResults(places);
      setNotice(places.length > 0 ? "" : `찾은 장소가 없어요.${fallbackHint}`);
    } catch (error) {
      if (searchId !== latestSearch.current) return;
      setNotice(toPlaceSearchFailureNotice(error, fallbackHint));
      if (error instanceof PlaceSearchError && error.status === PLACE_SEARCH_UNAUTHORIZED_STATUS) window.dispatchEvent(new Event(SESSION_LOST_EVENT));
    }
  };

  return { results, notice, search, close };
};
