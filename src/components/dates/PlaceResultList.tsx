import type { ReactElement } from "react";
import type { PlaceResult } from "@/lib/places/search";

interface PlaceResultListProps {
  /** 목록의 화면 읽기 이름. 한 화면에 목록이 둘 생길 수 있어 자리마다 다르게 준다 */
  label: string;
  results: PlaceResult[];
  isDisabled?: boolean;
  onSelect: (place: PlaceResult) => void;
}

/**
 * 장소 찾기 결과 목록(이름과 주소 두 줄). 기록 장소 칸과 사진 위치 창이 함께 쓴다.
 *
 * @example <PlaceResultList label="찾은 장소" results={results} onSelect={select} />
 */
export const PlaceResultList = ({ label, results, isDisabled = false, onSelect }: PlaceResultListProps): ReactElement => (
  <ul aria-label={label} className="mt-2 flex flex-col overflow-hidden rounded-[10px] border border-line bg-surface">
    {results.map((place) => (
      <li key={place.id} className="border-b border-line last:border-b-0">
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => onSelect(place)}
          className="press-card flex min-h-11 w-full flex-col justify-center px-4 py-2 text-left disabled:opacity-50"
        >
          <span className="text-[15px] break-words text-ink">{place.name}</span>
          {place.address && <span className="text-[12px] break-words text-ink-sub">{place.address}</span>}
        </button>
      </li>
    ))}
  </ul>
);
