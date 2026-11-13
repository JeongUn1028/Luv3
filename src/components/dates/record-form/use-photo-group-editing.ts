"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { DateRecordDraft, DraftErrors, PhotoLocation } from "@/lib/dates/form";
import {
  addPhotoGroup,
  addPhotosToGroup,
  applyPhotoInfo,
  findNextSelectedPhotoId,
  getDraftPhotos,
  moveGroupPhoto,
  moveItem,
  removeGroupPhoto,
  removePhotoGroup,
  setGroupLocation,
} from "@/lib/dates/photo-group-draft";
import { toPickNotice } from "@/lib/dates/photo-pick-notice";
import { clearError, FIX_FIELDS_NOTICE } from "@/lib/form";
import { readPhotoInfo } from "@/lib/photos/photo-info";
import type { PreviewUrls } from "@/lib/photos/preview-urls";
import { isAcceptedPhoto } from "@/lib/photos/resize";
import type { PhotoGroupActions, PickedPhoto } from "../PhotoGroupCard";

type RecordDraft = DateRecordDraft<PickedPhoto>;

interface UsePhotoGroupEditingParams {
  draft: RecordDraft;
  setDraft: Dispatch<SetStateAction<RecordDraft>>;
  setErrors: Dispatch<SetStateAction<DraftErrors>>;
  /** 폼 아래 안내. 고른 사진 중 뺀 것을 알린다 */
  setNotice: Dispatch<SetStateAction<string | undefined>>;
  /** 폼이 만든 미리보기 묶음. 사진을 빼면 그 미리보기를 해제한다 */
  previews: PreviewUrls;
}

interface PhotoGroupEditing {
  /** 사진 줄에서 누른 사진. 그 사진의 순서·대표·빼기를 모음 카드 아래에 연다 */
  selectedPhotoId: string | undefined;
  /** 폼을 처음부터 다시 쓸 때 이 훅의 상태(누른 사진)를 모두 되돌린다 */
  resetEditingState: () => void;
  /** 새 모음 만들기로 고른 사진 */
  handleAddGroup: (files: File[]) => void;
  handleLocationChange: (groupId: string, location: PhotoLocation) => void;
  /** 모음 카드에서 일어나는 일. 위치 고르기 창은 모음 목록이 연다 */
  actions: Omit<PhotoGroupActions, "onOpenLocation">;
}

/**
 * 기록 폼의 사진 모음 편집(#298·#315): 사진 고르기와 사진 정보 읽기, 모음·사진 빼기와 옮기기, 위치·장소 이름·한마디·대표 사진.
 * 사진 정보는 고른 뒤 따로 도착해 입력값을 바꾸므로, 그 값을 덮지 않게 모두 최신 상태에 맞춰 바꾼다.
 *
 * @example const photoGroups = usePhotoGroupEditing({ draft, setDraft, setErrors, setNotice, previews })
 */
export const usePhotoGroupEditing = ({ draft, setDraft, setErrors, setNotice, previews }: UsePhotoGroupEditingParams): PhotoGroupEditing => {
  const [selectedPhotoId, setSelectedPhotoId] = useState<string>();

  /** 고른 사진을 새 모음으로 만들거나(`groupId` 없음) 그 모음에 더하고, 사진마다 사진 정보를 읽기 시작한다 */
  const handlePickPhotos = (files: File[], groupId?: string) => {
    const images = files.filter(isAcceptedPhoto);
    const picked = images.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: previews.create(file),
      isReadingInfo: true,
    }));
    const newGroupId = crypto.randomUUID();
    const add = (current: RecordDraft, photos: PickedPhoto[]) =>
      groupId ? addPhotosToGroup(current, { groupId, photos }) : addPhotoGroup(current, { groupId: newGroupId, photos });
    const { droppedCount } = add(draft, picked);
    const kept = picked.slice(0, picked.length - droppedCount);
    picked.slice(kept.length).forEach(({ previewUrl }) => previews.revoke(previewUrl));
    // 앞서 고른 사진의 정보가 아직 그려지기 전에 도착했을 수 있어, 그 값을 덮지 않게 최신 상태에 더한다.
    // 정보를 읽기 시작하는 `kept`만 더해, 읽지 않는 사진이 "읽는 중"으로 남아 저장을 막는 일이 없게 한다
    setDraft((current) => add(current, kept).draft);
    setErrors((current) => clearError(current, "photos"));
    kept.forEach(({ id, file }) => {
      // 줄이거나 HEIC를 바꾸면 사진 정보가 사라지므로 고른 원본에서 읽는다. readPhotoInfo는 실패해도 빈 값으로 끝난다
      void readPhotoInfo({ file }).then((info) => {
        setDraft((current) => ({ ...current, groups: applyPhotoInfo(current.groups, { photoId: id, info }) }));
      });
    });

    const pickNotice = toPickNotice({ skippedCount: files.length - images.length, droppedCount, isNewGroup: !groupId });
    // 다른 칸 오류가 남아 있으면 칸 오류 안내는 그대로 둔다
    setNotice((current) => pickNotice ?? (current === FIX_FIELDS_NOTICE ? current : undefined));
  };

  /** 사진들을 빼며 미리보기를 해제한다 */
  const forgetPhotos = (photoIds: string[]) => {
    const ids = new Set(photoIds);
    getDraftPhotos(draft.groups).forEach(({ id, previewUrl }) => {
      if (ids.has(id)) previews.revoke(previewUrl);
    });
  };

  /** 빠지는 모음의 위치·장소 이름·한마디 오류를 지운다 */
  const clearGroupErrors = (groupId: string) => {
    setErrors((current) => clearError(clearError(clearError(current, `group:${groupId}`), `placeName:${groupId}`), `caption:${groupId}`));
  };

  const handleRemovePhoto = (photoId: string) => {
    forgetPhotos([photoId]);
    // 빼면 같은 모음의 이웃 사진을 골라, 이어서 빼거나 고칠 수 있게 한다
    setSelectedPhotoId(findNextSelectedPhotoId(draft.groups, photoId));
    // 마지막 사진이면 모음도 사라지므로 그 모음의 위치·한마디 오류도 지운다
    const group = draft.groups.find(({ photos }) => photos.some(({ id }) => id === photoId));
    if (group?.photos.length === 1) clearGroupErrors(group.id);
    setDraft((current) => removeGroupPhoto(current, photoId));
  };

  const handleRemoveGroup = (groupId: string) => {
    const photoIds = draft.groups.find(({ id }) => id === groupId)?.photos.map(({ id }) => id) ?? [];
    forgetPhotos(photoIds);
    if (selectedPhotoId && photoIds.includes(selectedPhotoId)) setSelectedPhotoId(undefined);
    clearGroupErrors(groupId);
    setDraft((current) => removePhotoGroup(current, groupId));
  };

  const handleLocationChange = (groupId: string, location: PhotoLocation) => {
    setDraft((current) => ({ ...current, groups: setGroupLocation(current.groups, { groupId, location }) }));
    setErrors((current) => clearError(current, `group:${groupId}`));
  };

  return {
    selectedPhotoId,
    resetEditingState: () => setSelectedPhotoId(undefined),
    handleAddGroup: (files) => handlePickPhotos(files),
    handleLocationChange,
    actions: {
      onSelectPhoto: setSelectedPhotoId,
      onAddPhotos: (groupId, files) => handlePickPhotos(files, groupId),
      onRemoveGroup: handleRemoveGroup,
      onMoveGroup: (index, offset) => setDraft((current) => ({ ...current, groups: moveItem(current.groups, index, offset) })),
      onRemovePhoto: handleRemovePhoto,
      onMovePhoto: (photoId, offset) => setDraft((current) => ({ ...current, groups: moveGroupPhoto(current.groups, { photoId, offset }) })),
      onCaptionChange: (groupId, caption) => {
        setDraft((current) => ({
          ...current,
          groups: current.groups.map((group) => (group.id === groupId ? { ...group, caption } : group)),
        }));
        setErrors((current) => clearError(current, `caption:${groupId}`));
      },
      onPlaceNameChange: (groupId, placeName) => {
        setDraft((current) => ({
          ...current,
          groups: current.groups.map((group) => (group.id === groupId ? { ...group, placeName } : group)),
        }));
        setErrors((current) => clearError(current, `placeName:${groupId}`));
      },
      onCoverChange: (photoId) => setDraft((current) => ({ ...current, coverPhotoId: photoId })),
    },
  };
};
