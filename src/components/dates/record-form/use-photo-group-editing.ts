"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { DraftErrors, PhotoLocation } from "@/lib/dates/form";
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
import { readPhotoInfo } from "@/lib/photos/photo-info";
import type { PreviewUrls } from "@/lib/photos/preview-urls";
import { isAcceptedPhoto } from "@/lib/photos/accepted";
import type { PhotoGroupActions, PickedPhoto } from "../PhotoGroupCard";
import type { RecordDraft } from "./record-draft";

interface UsePhotoGroupEditingParams {
  draft: RecordDraft;
  /** 사진 정보가 고른 뒤 늦게 도착해 입력값을 바꾸므로 입력값만은 이 훅이 바꾼다 */
  setDraft: Dispatch<SetStateAction<RecordDraft>>;
  /** 폼이 만든 미리보기 묶음. 사진을 빼면 그 미리보기를 해제한다 */
  previews: PreviewUrls;
}

/** 모음을 고친 뒤 폼이 반영할 것. 이 훅은 폼의 칸 오류와 폼 아래 안내를 바꾸지 않는다(#357) */
export interface PhotoGroupEditFeedback {
  /** 고쳐서 지울 칸 오류 */
  clearedErrors: (keyof DraftErrors)[];
  /** 사진을 골랐으면 그 안내. 뺀 것이 없으면 `notice`가 없다(`toNoticeAfterPick`) */
  picked?: { notice: string | undefined };
}

/** 폼에 반영할 것을 돌려주는 모음 카드 동작 */
type FeedbackActionName = "onAddPhotos" | "onRemoveGroup" | "onRemovePhoto" | "onCaptionChange" | "onPlaceNameChange";
type ReturnsFeedback<Handler> = Handler extends (...args: infer Args) => void ? (...args: Args) => PhotoGroupEditFeedback : never;
type PhotoGroupEditingActions = Omit<PhotoGroupActions, "onOpenLocation" | FeedbackActionName> & {
  [Name in FeedbackActionName]: ReturnsFeedback<PhotoGroupActions[Name]>;
};

interface PhotoGroupEditing {
  /** 사진 줄에서 누른 사진. 그 사진의 순서·대표·빼기를 모음 카드 아래에 연다 */
  selectedPhotoId: string | undefined;
  /** 폼을 처음부터 다시 쓸 때 이 훅의 상태(누른 사진)를 모두 되돌린다 */
  resetEditingState: () => void;
  /** 새 모음 만들기로 고른 사진 */
  handleAddGroup: (files: File[]) => PhotoGroupEditFeedback;
  handleLocationChange: (groupId: string, location: PhotoLocation) => PhotoGroupEditFeedback;
  /** 모음 카드에서 일어나는 일. 위치 고르기 창은 모음 목록이 연다. 칸 오류·안내를 바꾸는 동작은 폼에 반영할 것을 돌려준다 */
  actions: PhotoGroupEditingActions;
}

/**
 * 기록 폼의 사진 모음 편집(#298·#315): 사진 고르기와 사진 정보 읽기, 모음·사진 빼기와 옮기기, 위치·장소 이름·한마디·대표 사진.
 * 사진 정보는 고른 뒤 따로 도착해 입력값을 바꾸므로, 그 값을 덮지 않게 모두 최신 상태에 맞춰 바꾼다.
 * 칸 오류와 폼 아래 안내는 바꾸지 않고 반영할 것(`PhotoGroupEditFeedback`)을 돌려준다.
 *
 * @example const photoGroups = usePhotoGroupEditing({ draft, setDraft, previews }); applyFeedback(photoGroups.handleAddGroup(files))
 */
export const usePhotoGroupEditing = ({ draft, setDraft, previews }: UsePhotoGroupEditingParams): PhotoGroupEditing => {
  const [selectedPhotoId, setSelectedPhotoId] = useState<string>();

  /** 고른 사진을 새 모음으로 만들거나(`groupId` 없음) 그 모음에 더하고, 사진마다 사진 정보를 읽기 시작한다 */
  const handlePickPhotos = (files: File[], groupId?: string): PhotoGroupEditFeedback => {
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
    const { draft: added, droppedCount } = add(draft, picked);
    // 모음 위치는 새 모음의 첫 사진(pendingLocationPhotoId)에서만 읽으므로 그 사진만 동네 이름을 묻는다(#353)
    const locationPhotoId = groupId ? undefined : added.groups.find(({ id }) => id === newGroupId)?.pendingLocationPhotoId;
    const kept = picked.slice(0, picked.length - droppedCount);
    picked.slice(kept.length).forEach(({ previewUrl }) => previews.revoke(previewUrl));
    // 앞서 고른 사진의 정보가 아직 그려지기 전에 도착했을 수 있어, 그 값을 덮지 않게 최신 상태에 더한다.
    // 정보를 읽기 시작하는 `kept`만 더해, 읽지 않는 사진이 "읽는 중"으로 남아 저장을 막는 일이 없게 한다
    setDraft((current) => add(current, kept).draft);
    kept.forEach(({ id, file }) => {
      // 줄이거나 HEIC를 바꾸면 사진 정보가 사라지므로 고른 원본에서 읽는다. readPhotoInfo는 실패해도 빈 값으로 끝난다
      void readPhotoInfo({ file, isGroupLocation: id === locationPhotoId }).then((info) => {
        setDraft((current) => ({ ...current, groups: applyPhotoInfo(current.groups, { photoId: id, info }) }));
      });
    });

    return {
      clearedErrors: ["photos"],
      picked: { notice: toPickNotice({ skippedCount: files.length - images.length, droppedCount, isNewGroup: !groupId }) },
    };
  };

  /** 사진들을 빼며 미리보기를 해제한다 */
  const forgetPhotos = (photoIds: string[]) => {
    const ids = new Set(photoIds);
    getDraftPhotos(draft.groups).forEach(({ id, previewUrl }) => {
      if (ids.has(id)) previews.revoke(previewUrl);
    });
  };

  /** 빠지는 모음의 위치·장소 이름·한마디 오류 */
  const toGroupErrorKeys = (groupId: string): (keyof DraftErrors)[] => [`group:${groupId}`, `placeName:${groupId}`, `caption:${groupId}`];

  const handleRemovePhoto = (photoId: string): PhotoGroupEditFeedback => {
    forgetPhotos([photoId]);
    // 빼면 같은 모음의 이웃 사진을 골라, 이어서 빼거나 고칠 수 있게 한다
    setSelectedPhotoId(findNextSelectedPhotoId(draft.groups, photoId));
    // 마지막 사진이면 모음도 사라지므로 그 모음의 위치·한마디 오류도 지운다
    const group = draft.groups.find(({ photos }) => photos.some(({ id }) => id === photoId));
    setDraft((current) => removeGroupPhoto(current, photoId));
    return { clearedErrors: group?.photos.length === 1 ? toGroupErrorKeys(group.id) : [] };
  };

  const handleRemoveGroup = (groupId: string): PhotoGroupEditFeedback => {
    const photoIds = draft.groups.find(({ id }) => id === groupId)?.photos.map(({ id }) => id) ?? [];
    forgetPhotos(photoIds);
    if (selectedPhotoId && photoIds.includes(selectedPhotoId)) setSelectedPhotoId(undefined);
    setDraft((current) => removePhotoGroup(current, groupId));
    return { clearedErrors: toGroupErrorKeys(groupId) };
  };

  const handleLocationChange = (groupId: string, location: PhotoLocation): PhotoGroupEditFeedback => {
    setDraft((current) => ({ ...current, groups: setGroupLocation(current.groups, { groupId, location }) }));
    return { clearedErrors: [`group:${groupId}`] };
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
        return { clearedErrors: [`caption:${groupId}`] };
      },
      onPlaceNameChange: (groupId, placeName) => {
        setDraft((current) => ({
          ...current,
          groups: current.groups.map((group) => (group.id === groupId ? { ...group, placeName } : group)),
        }));
        return { clearedErrors: [`placeName:${groupId}`] };
      },
      onCoverChange: (photoId) => setDraft((current) => ({ ...current, coverPhotoId: photoId })),
    },
  };
};
