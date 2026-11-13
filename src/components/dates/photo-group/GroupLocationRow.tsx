import type { ReactElement } from "react";
import { FieldError } from "@/components/FormField";
import { MapPinIcon } from "@/components/icons";
import type { GroupLocationSource, PhotoLocation } from "@/lib/dates/form";
import { toGroupLocationText } from "@/lib/dates/group-location";

interface GroupLocationRowProps {
  /** 화면 읽기 프로그램에 읽어 줄 모음 이름(모음 1) */
  groupName: string;
  /** 오류 문구 id의 앞부분. 모음 카드 제목 id를 쓴다 */
  idPrefix: string;
  location: PhotoLocation | undefined;
  locationSource: GroupLocationSource | undefined;
  /** 첫 사진의 사진 정보를 읽는 중인지. 그동안은 위치 고르기를 누를 수 없다 */
  isReadingLocation: boolean;
  error: string | undefined;
  isDisabled: boolean;
  onOpenLocation: () => void;
}

/**
 * 모음 카드의 위치 줄(#298): 동네 이름과 어디서 정했는지, 위치 고르기 창을 여는 버튼, 위치가 없을 때의 오류 문구.
 *
 * @example <GroupLocationRow groupName="모음 1" idPrefix={headingId} location={group.location} locationSource={group.locationSource} isReadingLocation={false} error={undefined} isDisabled={false} onOpenLocation={open} />
 */
export const GroupLocationRow = ({
  groupName,
  idPrefix,
  location,
  locationSource,
  isReadingLocation,
  error,
  isDisabled,
  onOpenLocation,
}: GroupLocationRowProps): ReactElement => {
  const { label, note } = toGroupLocationText({ location, locationSource, isReadingLocation });
  const errorId = `${idPrefix}-location-error`;
  const hasLocation = Boolean(location);
  // 위치가 있거나 읽는 중이면 바꾸기, 없으면 고르기를 눈에 띄게 둔다
  const isChangeMode = hasLocation || isReadingLocation;

  return (
    <>
      <div className={`flex items-center gap-2 rounded-[10px] border bg-background px-3 py-2 ${error ? "border-accent" : "border-line"}`}>
        <MapPinIcon className={`size-[18px] shrink-0 ${hasLocation ? "text-accent" : "text-ink-sub"}`} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className={`truncate text-[14px] ${hasLocation ? "text-ink" : "text-ink-sub"}`}>
            <span className="sr-only">{groupName} 위치: </span>
            {label}
          </p>
          {note && <p className="text-[11px] text-ink-sub">{note}</p>}
        </div>
        {/* 위치를 고르면 이름만 바뀌는 같은 버튼이라, 창이 닫히며 돌아온 초점을 잃지 않는다.
            첫 사진 정보를 읽는 동안은 읽은 위치와 엇갈리지 않게 누를 수 없다. 위치가 없으면 저장할 때 첫 오류 칸이 된다(data-invalid) */}
        <button
          type="button"
          disabled={isDisabled || isReadingLocation}
          data-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onClick={onOpenLocation}
          className={
            isChangeMode
              ? "press-icon relative h-9 shrink-0 rounded-[8px] border border-line px-2.5 text-[12px] text-ink-sub after:absolute after:-inset-[5px] disabled:opacity-50"
              : "press-icon relative h-9 shrink-0 rounded-[8px] bg-accent px-3 text-[13px] text-background after:absolute after:-inset-[5px] disabled:opacity-50"
          }
        >
          {isChangeMode ? "위치 바꾸기" : "지도에서 고르기"}
          <span className="sr-only"> ({groupName})</span>
        </button>
      </div>
      <FieldError id={errorId} error={error} />
    </>
  );
};
