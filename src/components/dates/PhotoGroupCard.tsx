"use client";

import type { ReactElement } from "react";
import { FieldError, FieldLabel } from "@/components/FormField";
import { CAPTION_MAX_LENGTH, PLACE_NAME_MAX_LENGTH, type DraftErrors, type DraftPhoto, type DraftPhotoGroup } from "@/lib/dates/form";
import { toGroupName } from "@/lib/dates/group-name";
import { countChars } from "@/lib/form";
import { GroupHeader } from "./photo-group/GroupHeader";
import { GroupLocationRow } from "./photo-group/GroupLocationRow";
import { GroupPhotos } from "./photo-group/GroupPhotos";
import { SelectedPhotoActions } from "./photo-group/SelectedPhotoActions";

export interface PickedPhoto extends DraftPhoto {
  /** 이번에 새로 고른 사진의 파일. 이미 저장된 사진(수정 화면)은 undefined */
  file: File | undefined;
  /** 새 사진은 object URL(빼거나 화면을 떠날 때 해제), 저장된 사진은 썸네일 서명 URL */
  previewUrl: string | undefined;
  /** 새로 고른 사진에서 찍은 곳·찍은 시각을 읽는 중인지. 그동안 저장 버튼을 막는다 */
  isReadingInfo: boolean;
}

/** 모음 카드에서 일어나는 일. 모음 목록(PhotoGroupsField)이 폼에 그대로 넘긴다 */
export interface PhotoGroupActions {
  onSelectPhoto: (photoId: string | undefined) => void;
  onAddPhotos: (groupId: string, files: File[]) => void;
  onRemoveGroup: (groupId: string) => void;
  onMoveGroup: (index: number, offset: -1 | 1) => void;
  onRemovePhoto: (photoId: string) => void;
  onMovePhoto: (photoId: string, offset: -1 | 1) => void;
  onCaptionChange: (groupId: string, caption: string) => void;
  onPlaceNameChange: (groupId: string, placeName: string) => void;
  onCoverChange: (photoId: string) => void;
  onOpenLocation: (groupId: string) => void;
}

interface PhotoGroupCardProps {
  group: DraftPhotoGroup<PickedPhoto>;
  /** 화면 순서(0부터) */
  index: number;
  groupCount: number;
  coverPhotoId: string | undefined;
  selectedPhotoId: string | undefined;
  errors: DraftErrors;
  isDisabled: boolean;
  actions: PhotoGroupActions;
  /** 모음이 빠져 이웃 모음도 없을 때 초점을 받을 곳(새 모음 만들기) */
  focusFallback: () => HTMLElement | null;
}

/**
 * 사진 모음 하나(#298): 모음 이름·장수와 위·아래·빼기, 위치 줄, 장소 이름, 사진 줄, 사진 더하기, 누른 사진의 순서·대표·빼기, 모음 한마디.
 * 위치·장소 이름(#317)·한마디(#309)는 모음마다 하나라 사진마다 묻지 않는다. 사진을 다른 모음으로 옮기는 기능은 없다(2026-11-11 사용자 결정).
 *
 * @example <PhotoGroupCard group={group} index={0} groupCount={2} coverPhotoId={cover} selectedPhotoId={undefined} errors={{}} isDisabled={false} actions={actions} focusFallback={() => pickRef.current} />
 */
export const PhotoGroupCard = ({
  group,
  index,
  groupCount,
  coverPhotoId,
  selectedPhotoId,
  errors,
  isDisabled,
  actions,
  focusFallback,
}: PhotoGroupCardProps): ReactElement => {
  const name = toGroupName(index + 1);
  const headingId = `photo-group-${group.id}`;
  const selectedIndex = group.photos.findIndex(({ id }) => id === selectedPhotoId);
  const selected = group.photos[selectedIndex];
  const captionId = `${headingId}-caption`;
  const captionError = errors[`caption:${group.id}`];
  const placeNameId = `${headingId}-place-name`;
  const placeNameError = errors[`placeName:${group.id}`];

  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-2.5 rounded-[12px] bg-surface p-3">
      <GroupHeader
        id={headingId}
        groupName={name}
        photoCount={group.photos.length}
        isFirst={index === 0}
        isLast={index === groupCount - 1}
        isDisabled={isDisabled}
        onMove={(offset) => actions.onMoveGroup(index, offset)}
        onRemove={() => actions.onRemoveGroup(group.id)}
        focusFallback={focusFallback}
      />

      <GroupLocationRow
        groupName={name}
        idPrefix={headingId}
        location={group.location}
        locationSource={group.locationSource}
        isReadingLocation={group.pendingLocationPhotoId !== undefined}
        error={errors[`group:${group.id}`]}
        isDisabled={isDisabled}
        onOpenLocation={() => actions.onOpenLocation(group.id)}
      />

      <div className="flex flex-col">
        <FieldLabel
          htmlFor={placeNameId}
          label={
            <>
              장소 이름<span className="sr-only"> ({name})</span>
            </>
          }
          hint="선택 · 비우면 동네 이름"
        />
        {/* 넘쳐도 지우지 않고 저장할 때 알리도록 제한의 두 배까지 받는다. 저장은 30자까지다(DB 제약과 같다) */}
        <input
          id={placeNameId}
          type="text"
          value={group.placeName}
          maxLength={PLACE_NAME_MAX_LENGTH * 2}
          placeholder="예: 골목 끝 카페"
          disabled={isDisabled}
          aria-invalid={Boolean(placeNameError)}
          aria-describedby={placeNameError ? `${placeNameId}-error` : undefined}
          onChange={(event) => actions.onPlaceNameChange(group.id, event.target.value)}
          className="mt-2 h-11 w-full rounded-[8px] border border-line bg-background px-3 text-[16px] text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent disabled:opacity-50"
        />
        <FieldError id={`${placeNameId}-error`} error={placeNameError} />
      </div>

      <GroupPhotos
        groupName={name}
        photos={group.photos}
        coverPhotoId={coverPhotoId}
        selectedPhotoId={selectedPhotoId}
        isDisabled={isDisabled}
        onSelectPhoto={actions.onSelectPhoto}
        onAddPhotos={(files) => actions.onAddPhotos(group.id, files)}
      />

      {selected && (
        // 사진을 누르면 순서·대표·빼기만 연다. 한마디는 모음마다 하나라 아래 칸에 쓴다(#309)
        <SelectedPhotoActions
          groupName={name}
          photoId={selected.id}
          photoIndex={selectedIndex}
          photoCount={group.photos.length}
          isCover={selected.id === coverPhotoId}
          isDisabled={isDisabled}
          onCoverChange={actions.onCoverChange}
          onMovePhoto={actions.onMovePhoto}
          onRemovePhoto={actions.onRemovePhoto}
          focusFallback={focusFallback}
        />
      )}

      <div className="flex flex-col border-t border-line pt-2.5">
        <FieldLabel
          htmlFor={captionId}
          label={
            <>
              한마디<span className="sr-only"> ({name})</span>
            </>
          }
          hint="선택"
          aside={
            <span id={`${captionId}-count`} className="font-display text-[12px] tracking-[1px] text-ink-sub">
              {countChars(group.caption.trim())}/{CAPTION_MAX_LENGTH}
            </span>
          }
        />
        {/* 넘쳐도 지우지 않고 저장할 때 알리도록 제한의 두 배까지 받는다. 저장은 100자까지다(DB 제약과 같다).
            칸은 글에 맞춰 늘어난다. 두 줄로 고정하면 긴 한마디가 칸 안에서 스크롤돼 첫 줄이 잘려 보인다 */}
        <textarea
          id={captionId}
          rows={2}
          value={group.caption}
          maxLength={CAPTION_MAX_LENGTH * 2}
          disabled={isDisabled}
          aria-invalid={Boolean(captionError)}
          aria-describedby={[`${captionId}-count`, captionError && `${captionId}-error`].filter(Boolean).join(" ")}
          onChange={(event) => actions.onCaptionChange(group.id, event.target.value)}
          className="mt-2 field-sizing-content min-h-[70px] w-full resize-none rounded-[8px] border border-line bg-background px-3 py-2.5 text-[16px] leading-[1.5] text-ink focus:border-accent focus:outline-none aria-[invalid=true]:border-accent disabled:opacity-50"
        />
        <FieldError id={`${captionId}-error`} error={captionError} />
      </div>
    </li>
  );
};
