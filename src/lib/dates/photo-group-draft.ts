import type { DateRecordDraft, DraftPhoto, DraftPhotoGroup, PhotoLocation } from "./form";

/** 모음 하나에 올릴 수 있는 사진 수(create_date_record와 같다). 한 번에 고르는 사진 수도 이만큼이다 */
export const MAX_GROUP_PHOTOS = 10;
/** 기록 하나에 만들 수 있는 모음 수(create_date_record와 같다) */
export const MAX_GROUPS = 10;
/** 기록 하나에 올릴 수 있는 사진 수 */
export const MAX_RECORD_PHOTOS = MAX_GROUP_PHOTOS * MAX_GROUPS;

/**
 * 모음을 펼친 사진 목록. 모음 순서, 모음 안 순서대로다(저장하면 이 순서가 사진 순서가 된다).
 *
 * @example getDraftPhotos(draft.groups).length // 9
 */
export const getDraftPhotos = <Photo extends DraftPhoto>(groups: DraftPhotoGroup<Photo>[]): Photo[] => groups.flatMap(({ photos }) => photos);

/**
 * 빼려는 사진 다음에 고를 사진: 같은 모음의 다음 사진, 없으면 앞 사진. 모음이 통째로 빠지면 고르지 않는다.
 *
 * @example setSelectedPhotoId(findNextSelectedPhotoId(draft.groups, photoId))
 */
export const findNextSelectedPhotoId = (groups: Pick<DraftPhotoGroup, "photos">[], photoId: string): string | undefined => {
  const photos = groups.find((group) => group.photos.some(({ id }) => id === photoId))?.photos ?? [];
  const index = photos.findIndex(({ id }) => id === photoId);
  return (photos[index + 1] ?? photos[index - 1])?.id;
};

/** 사진을 뺀 뒤 대표 사진이 남아 있지 않으면 첫 사진을 대표로 정한다 */
const withCover = <Photo extends DraftPhoto>(draft: DateRecordDraft<Photo>): DateRecordDraft<Photo> => {
  const photos = getDraftPhotos(draft.groups);
  const hasCover = photos.some(({ id }) => id === draft.coverPhotoId);
  return hasCover ? draft : { ...draft, coverPhotoId: photos[0]?.id };
};

/**
 * 한 번에 고른 사진으로 모음을 만들어 뒤에 붙인다. 10장을 넘는 사진과, 모음이 10개면 고른 사진 전체를 버린다.
 * 위치는 첫 사진의 사진 정보가 도착하면 채운다(`applyPhotoInfo`).
 *
 * @example addPhotoGroup(draft, { groupId: crypto.randomUUID(), photos }) // { draft, droppedCount: 0 }
 */
export const addPhotoGroup = <Photo extends DraftPhoto>(
  draft: DateRecordDraft<Photo>,
  { groupId, photos }: { groupId: string; photos: Photo[] },
): { draft: DateRecordDraft<Photo>; droppedCount: number } => {
  const kept = draft.groups.length < MAX_GROUPS ? photos.slice(0, MAX_GROUP_PHOTOS) : [];
  if (kept.length === 0) return { draft, droppedCount: photos.length };
  const group: DraftPhotoGroup<Photo> = { id: groupId, location: undefined, locationSource: undefined, pendingLocationPhotoId: kept[0]?.id, placeName: "", caption: "", photos: kept };
  return { draft: withCover({ ...draft, groups: [...draft.groups, group] }), droppedCount: photos.length - kept.length };
};

/**
 * 모음에 사진을 더한다. 모음마다 10장을 넘는 사진은 버린다. 모음이 없으면 그대로 둔다.
 *
 * @example addPhotosToGroup(draft, { groupId, photos }) // { draft, droppedCount: 2 }
 */
export const addPhotosToGroup = <Photo extends DraftPhoto>(
  draft: DateRecordDraft<Photo>,
  { groupId, photos }: { groupId: string; photos: Photo[] },
): { draft: DateRecordDraft<Photo>; droppedCount: number } => {
  const target = draft.groups.find(({ id }) => id === groupId);
  if (!target) return { draft, droppedCount: photos.length };
  const room = Math.max(MAX_GROUP_PHOTOS - target.photos.length, 0);
  const groups = draft.groups.map((group) => (group.id === groupId ? { ...group, photos: [...group.photos, ...photos.slice(0, room)] } : group));
  return { draft: withCover({ ...draft, groups }), droppedCount: Math.max(photos.length - room, 0) };
};

/**
 * 모음을 통째로 뺀다. 대표 사진이 그 모음에 있었으면 남은 첫 사진이 대표가 된다.
 *
 * @example removePhotoGroup(draft, groupId)
 */
export const removePhotoGroup = <Photo extends DraftPhoto>(draft: DateRecordDraft<Photo>, groupId: string): DateRecordDraft<Photo> =>
  withCover({ ...draft, groups: draft.groups.filter(({ id }) => id !== groupId) });

/**
 * 사진 한 장을 뺀다. 모음이 비면 모음도 뺀다(모음에는 사진이 한 장 이상 있어야 한다). 대표 사진을 빼면 남은 첫 사진이 대표가 된다.
 *
 * @example removeGroupPhoto(draft, photoId)
 */
export const removeGroupPhoto = <Photo extends DraftPhoto>(draft: DateRecordDraft<Photo>, photoId: string): DateRecordDraft<Photo> => {
  const groups = draft.groups
    .map((group) => ({
      ...group,
      photos: group.photos.filter(({ id }) => id !== photoId),
      // 위치를 읽던 첫 사진을 빼면 그 정보는 쓰지 않는다. 위치 없음으로 두어 지도에서 고르게 한다
      pendingLocationPhotoId: group.pendingLocationPhotoId === photoId ? undefined : group.pendingLocationPhotoId,
    }))
    .filter(({ photos }) => photos.length > 0);
  return withCover({ ...draft, groups });
};

/**
 * 목록에서 하나를 앞(-1)이나 뒤(+1)로 옮긴다. 범위를 넘으면 그대로 돌려준다.
 *
 * @example moveItem(groups, 2, -1) // 세 번째 모음을 두 번째로
 */
export const moveItem = <Item>(items: Item[], index: number, offset: -1 | 1): Item[] => {
  const target = index + offset;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const moved = [...items];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
};

/**
 * 모음 안에서 사진 하나를 앞(-1)이나 뒤(+1)로 옮긴다. 다른 모음으로는 옮기지 않는다.
 *
 * @example moveGroupPhoto(groups, { photoId, offset: -1 })
 */
export const moveGroupPhoto = <Photo extends DraftPhoto>(
  groups: DraftPhotoGroup<Photo>[],
  { photoId, offset }: { photoId: string; offset: -1 | 1 },
): DraftPhotoGroup<Photo>[] =>
  groups.map((group) => {
    const index = group.photos.findIndex(({ id }) => id === photoId);
    return index === -1 ? group : { ...group, photos: moveItem(group.photos, index, offset) };
  });

/**
 * 모음 위치를 직접 고른 위치로 바꾼다. 아직 첫 사진 정보를 읽는 중이어도 고른 위치가 이긴다.
 *
 * @example setGroupLocation(groups, { groupId, location: { place: "성동구 성수1가1동", lat: 37.54, lng: 127.05 } })
 */
export const setGroupLocation = <Photo extends DraftPhoto>(
  groups: DraftPhotoGroup<Photo>[],
  { groupId, location }: { groupId: string; location: PhotoLocation },
): DraftPhotoGroup<Photo>[] =>
  groups.map((group) => (group.id === groupId ? { ...group, location, locationSource: "picked", pendingLocationPhotoId: undefined } : group));

const toTime = (takenAt: string | undefined): number | undefined => {
  if (takenAt === undefined) return undefined;
  const time = Date.parse(takenAt);
  return Number.isNaN(time) ? undefined : time;
};

/**
 * 모음을 첫 사진의 찍은 시각 순서 자리로 옮긴다. 다른 모음의 순서는 그대로 두고, 이 모음보다 늦게 찍은 첫 모음 앞에 넣는다.
 * 찍은 시각을 모르는 모음은 견주지 않고 지나간다. 이 모음의 찍은 시각을 모르면 그대로 둔다.
 * `takenAt`을 주면 이 모음의 시각으로 쓴다. 정보를 읽는 사이 사진 순서가 바뀌어도 모음을 만들 때의 첫 사진 시각으로 자리를 정한다.
 *
 * @example placeGroupByTakenAt(groups, groupId)
 */
export const placeGroupByTakenAt = <Photo extends DraftPhoto>(
  groups: DraftPhotoGroup<Photo>[],
  groupId: string,
  takenAt?: string,
): DraftPhotoGroup<Photo>[] => {
  const group = groups.find(({ id }) => id === groupId);
  const time = toTime(takenAt ?? group?.photos[0]?.takenAt);
  if (!group || time === undefined) return groups;
  const others = groups.filter(({ id }) => id !== groupId);
  const laterIndex = others.findIndex((other) => {
    const otherTime = toTime(other.photos[0]?.takenAt);
    return otherTime !== undefined && otherTime > time;
  });
  const index = laterIndex === -1 ? others.length : laterIndex;
  return [...others.slice(0, index), group, ...others.slice(index)];
};

/** 새로 고른 사진에서 읽은 값 */
interface ReadPhotoInfo {
  location: PhotoLocation | undefined;
  takenAt: string | undefined;
}

/**
 * 새로 고른 사진의 사진 정보가 도착하면 찍은 시각을 채우고 읽는 중 표시를 지운다.
 * 그 사진이 모음을 만들 때의 첫 사진이면 모음 위치를 채우고(직접 고른 위치가 있으면 그대로), 모음을 찍은 시각 순서 자리로 옮긴다.
 *
 * @example setDraft((current) => ({ ...current, groups: applyPhotoInfo(current.groups, { photoId, info }) }))
 */
export const applyPhotoInfo = <Photo extends DraftPhoto & { isReadingInfo: boolean }>(
  groups: DraftPhotoGroup<Photo>[],
  { photoId, info }: { photoId: string; info: ReadPhotoInfo },
): DraftPhotoGroup<Photo>[] => {
  const withInfo = groups.map((group): DraftPhotoGroup<Photo> => {
    if (!group.photos.some(({ id }) => id === photoId)) return group;
    const photos = group.photos.map((photo) => (photo.id === photoId ? { ...photo, isReadingInfo: false, takenAt: info.takenAt } : photo));
    if (group.pendingLocationPhotoId !== photoId) return { ...group, photos };
    return { ...group, photos, location: info.location, locationSource: info.location ? "photo" : undefined, pendingLocationPhotoId: undefined };
  });
  const placed = groups.find(({ pendingLocationPhotoId }) => pendingLocationPhotoId === photoId);
  return placed ? placeGroupByTakenAt(withInfo, placed.id, info.takenAt) : withInfo;
};
