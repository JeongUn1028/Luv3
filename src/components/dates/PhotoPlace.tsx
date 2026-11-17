import type { ReactElement } from "react";
import { MapPinIcon } from "@/components/icons";
import { toShortRegionName } from "@/lib/places/region-name";

interface PhotoPlaceProps {
  /** 모음의 행정동 이름. 다듬어(성수동) 보여 준다 */
  place: string;
  /** 사용자가 붙인 장소 이름. 없으면 동 이름만 보인다 */
  placeName: string | undefined;
}

/**
 * 사진이 속한 모음의 장소 줄(#249, #317). 직접 붙인 장소 이름은 분홍으로, 다듬은 동 이름은 회색으로 둔다.
 * 기록 상세와 사진 크게 보기(#350)가 같이 쓴다.
 *
 * @example <PhotoPlace place="서울특별시 성동구 성수1가1동" placeName="골목 끝 카페" />
 */
export const PhotoPlace = ({ place, placeName }: PhotoPlaceProps): ReactElement => (
  <p className="flex flex-wrap items-center gap-x-1 text-[13px] text-ink-sub">
    <MapPinIcon className="size-3.5 shrink-0 text-accent" />
    <span className="sr-only">찍은 곳: </span>
    {/* 사이의 빈칸은 줄 배치(flex)에서는 보이지 않고, 화면 읽기 프로그램이 두 이름을 붙여 읽지 않게 한다 */}
    {placeName && (
      <>
        <span className="min-w-0 text-[14px] break-words text-accent">{placeName}</span>{" "}
      </>
    )}
    <span className="min-w-0 break-words">
      {placeName && <span aria-hidden="true">· </span>}
      {toShortRegionName(place)}
    </span>
  </p>
);
