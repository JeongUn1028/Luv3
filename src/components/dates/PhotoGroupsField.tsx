"use client";

import { useRef, useState, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { FIELD_LABEL_CLASS_NAME, FieldError } from "@/components/FormField";
import type { DraftErrors, DraftPhotoGroup, PhotoLocation } from "@/lib/dates/form";
import { findNearbyGroupLocation, toOtherGroupLocations, type OtherGroupLocation } from "@/lib/dates/group-location";
import { toGroupName } from "@/lib/dates/group-name";
import { MAX_GROUPS, MAX_RECORD_PHOTOS, getDraftPhotos } from "@/lib/dates/photo-group-draft";
import { PHOTO_INPUT_ACCEPT } from "@/lib/photos/resize";
import { GroupLocationDialog, type GroupLocationDialogHandle } from "./GroupLocationDialog";
import { PhotoGroupCard, type PhotoGroupActions, type PickedPhoto } from "./PhotoGroupCard";

interface PhotoGroupsFieldProps {
  groups: DraftPhotoGroup<PickedPhoto>[];
  coverPhotoId: string | undefined;
  selectedPhotoId: string | undefined;
  errors: DraftErrors;
  isDisabled: boolean;
  /** 지도 키. 위치 고르기 창의 지도에 쓴다 */
  mapKey: string | undefined;
  /** 새 모음 만들기로 고른 사진 */
  onAddGroup: (files: File[]) => void;
  onLocationChange: (groupId: string, location: PhotoLocation) => void;
  actions: Omit<PhotoGroupActions, "onOpenLocation">;
}

/** 위치 고르기 창을 연 모음과 열 때 정한 값 */
interface LocationTarget {
  groupId: string;
  title: string;
  initialLocation: PhotoLocation | undefined;
  otherLocations: OtherGroupLocation[];
}

/**
 * 기록 폼의 사진 칸(#298): 사진을 한 번에 고른 묶음(모음) 단위로 올린다. 모음 하나가 장소 하나라 위치는 모음마다 하나다.
 * 모음 수·사진 수를 보여 주고, 새 모음 만들기와 모음 위치 고르기 창을 둔다.
 *
 * @example <PhotoGroupsField groups={draft.groups} coverPhotoId={draft.coverPhotoId} selectedPhotoId={selected} errors={errors} isDisabled={false} mapKey={key} onAddGroup={add} onLocationChange={setLocation} actions={actions} />
 */
export const PhotoGroupsField = ({
  groups,
  coverPhotoId,
  selectedPhotoId,
  errors,
  isDisabled,
  mapKey,
  onAddGroup,
  onLocationChange,
  actions,
}: PhotoGroupsFieldProps): ReactElement => {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickButtonRef = useRef<HTMLButtonElement>(null);
  const locationDialogRef = useRef<GroupLocationDialogHandle>(null);
  // 창은 하나만 두고 연 모음을 바꾼다. 연 동안 다른 모음의 사진 정보가 와 모음 순서가 바뀌어도 제목·모음 번호가 바뀌지 않게 열 때의 값을 쓴다.
  // 창이 닫힌 뒤에도 제목이 남도록 닫을 때 지우지 않는다
  const [locationTarget, setLocationTarget] = useState<LocationTarget>();
  const photoCount = getDraftPhotos(groups).length;
  const isFull = groups.length >= MAX_GROUPS;

  const openLocationDialog = (groupId: string) => {
    const index = groups.findIndex(({ id }) => id === groupId);
    const group = groups[index];
    if (!group) return;
    // 창이 열릴 때 제목과 처음 자리가 이 모음 것이어야 한다
    flushSync(() =>
      setLocationTarget({
        groupId,
        title: `${toGroupName(index + 1)} 위치 고르기`,
        initialLocation: group.location ?? findNearbyGroupLocation(groups, index),
        otherLocations: toOtherGroupLocations(groups, groupId),
      }),
    );
    locationDialogRef.current?.open();
  };

  return (
    // 오류 문구는 첫 오류 칸이 되는 새 모음 만들기 버튼이 설명으로 읽는다. 묶음에도 두면 같은 문구를 두 번 읽는다
    <fieldset className="flex flex-col">
      <legend className="flex w-full items-baseline justify-between">
        <span className={FIELD_LABEL_CLASS_NAME}>
          사진 모음{" "}
          <span className="font-display tracking-[1px]">
            {groups.length}/{MAX_GROUPS}
          </span>
        </span>
        <span className="text-[12px] text-ink-sub">
          사진{" "}
          <span className="font-display tracking-[1px]">
            {photoCount}/{MAX_RECORD_PHOTOS}
          </span>
        </span>
      </legend>
      {groups.length > 0 && (
        <ol className="mt-2 flex flex-col gap-3">
          {groups.map((group, index) => (
            <PhotoGroupCard
              key={group.id}
              group={group}
              index={index}
              groupCount={groups.length}
              coverPhotoId={coverPhotoId}
              selectedPhotoId={selectedPhotoId}
              errors={errors}
              isDisabled={isDisabled}
              actions={{ ...actions, onOpenLocation: openLocationDialog }}
              focusFallback={() => pickButtonRef.current}
            />
          ))}
        </ol>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_INPUT_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          onAddGroup(Array.from(event.target.files ?? []));
          // 같은 사진을 뺐다가 다시 고를 수 있도록 선택값을 비운다
          event.target.value = "";
        }}
        aria-label="사진 고르기"
      />
      <button
        ref={pickButtonRef}
        type="button"
        disabled={isDisabled || isFull}
        // 사진이 없으면 저장할 때 이 버튼이 첫 오류 칸이 된다. 버튼에는 aria-invalid를 쓸 수 없어 data로 표시한다(DatePickerField와 같다)
        data-invalid={Boolean(errors.photos)}
        aria-describedby={errors.photos ? "photos-error" : "photos-hint"}
        onClick={() => inputRef.current?.click()}
        className="press-wide mt-2 h-[51px] w-full rounded-[10px] border border-dashed border-line px-3 text-[15px] text-ink-sub hover:text-ink disabled:opacity-40 data-[invalid=true]:border-accent"
      >
        {isFull ? `모음은 ${MAX_GROUPS}개까지 만들 수 있어요` : "새 모음 만들기 · 사진 고르기"}
      </button>
      {/* 빈 작성 화면에 스크롤이 생기지 않게(#52) 안내는 모음이 생긴 뒤에만 보인다. 처음에는 화면 읽기 프로그램에만 읽어 준다 */}
      <p id="photos-hint" className={groups.length > 0 ? "mt-1.5 text-[12px] leading-[1.6] text-ink-sub" : "sr-only"}>
        한 번에 고른 사진(10장까지)이 한 모음이 돼요. 장소가 다르면 모음을 나눠 골라 주세요.
      </p>
      <FieldError id="photos-error" error={errors.photos} />
      <GroupLocationDialog
        ref={locationDialogRef}
        title={locationTarget?.title ?? ""}
        appKey={mapKey}
        initialLocation={locationTarget?.initialLocation}
        otherLocations={locationTarget?.otherLocations ?? []}
        onChoose={(location) => {
          if (locationTarget) onLocationChange(locationTarget.groupId, location);
        }}
      />
    </fieldset>
  );
};
