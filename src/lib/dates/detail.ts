import type { PhotoLocation } from "./form";
import type { AuthorRow } from "@/lib/author";
import type { SignedUrl } from "@/lib/photos/signed-urls";
import { isRepeatRule } from "@/lib/events/calendar";
import { toEventEditHref } from "@/lib/events/recurrence";
import { comparePhotoOrder, groupPhotosInOrder } from "./photo-groups";
import { buildGroupRoute, type PhotoRoute } from "./route";

export interface DetailPhoto {
  id: string;
  /** 사진이 속한 모음. 지금 보는 모음의 한마디를 찾을 때 쓴다(#309) */
  groupId: string;
  /** 원본(긴 변 2000px) 서명 URL. 받지 못했으면 빈 칸으로 그린다 */
  url: string | undefined;
  /** 썸네일(긴 변 600px) 서명 URL. 처음 펼칠 사진에만 있고, 원본을 받는 동안 먼저 보여 준다(#313) */
  thumbUrl: string | undefined;
  /** 사진이 속한 모음의 행정동 이름(#249, #297). 화면은 다듬어(성수동) 보여 준다 */
  place: string;
  /** 사진이 속한 모음에 사용자가 붙인 장소 이름(#317). 없으면 undefined */
  placeName: string | undefined;
}

/** 기록 상세의 사진 모음 하나. 모음 칩은 없앴고(#317) 지금 보는 모음의 한마디를 찾을 때 쓴다 */
export interface DetailGroup {
  id: string;
  /** 모음 한마디(#309). 그 모음 사진을 보는 동안 사진 아래에 보여 준다 */
  caption: string | undefined;
}

/**
 * 주소에 지정한 사진의 순서. 지정하지 않았거나 그사이 지워진 사진이면 첫 사진(0)부터 보여 준다.
 *
 * @example findStartPhotoIndex(record.photos, "p2") // 1
 */
export const findStartPhotoIndex = (photos: { id: string }[], photoId: string | undefined): number =>
  Math.max(0, photos.findIndex(({ id }) => id === photoId));

/** 기록 상세 화면에 그리는 값 */
export interface DateRecordDetail {
  id: string;
  /** YYYY-MM-DD. 기간이면 시작일 */
  date: string;
  /** 기간의 끝 날짜. 하루짜리면 undefined */
  endDate: string | undefined;
  title: string;
  memo: string | undefined;
  tags: string[];
  /** 작성자 닉네임. 읽지 못했으면 작성자 표시를 그리지 않는다 */
  authorNickname: string | undefined;
  /** 일정에서 남긴 기록이면 그 일정의 고치기 주소(#227). 직접 쓴 기록이거나 일정이 지워졌으면 undefined */
  eventHref: string | undefined;
  /** 이어진 일정과 그 고치기 주소(연결 끊기, #237). 직접 쓴 기록이거나 일정이 지워졌으면 undefined */
  linkedEvent: { id: string; title: string; href: string } | undefined;
  /** sort_order 순서 */
  photos: DetailPhoto[];
  /** 모음 순서 */
  groups: DetailGroup[];
  /** 모음 위치를 모음 순서대로 이은 동선(#251, #299). 이을 곳이 둘 미만이면 undefined */
  route: PhotoRoute | undefined;
}

/** 수정 화면 초기값. 글은 입력칸에 바로 넣도록 빈 값을 빈 문자열로 둔다 */
export interface EditableRecord {
  id: string;
  /** 불러온 때의 판 번호. 저장할 때 보내 그사이 바뀌었는지 확인한다 */
  revision: string;
  date: string;
  endDate: string | undefined;
  title: string;
  memo: string;
  coverPhotoId: string | undefined;
  tags: string[];
  /** 이미 저장된 사진 모음(#298). 모음 순서, 모음 안 순서대로다 */
  groups: EditableGroup[];
}

/** 수정 화면의 저장된 모음. 사진 미리보기는 썸네일 서명 URL */
export interface EditableGroup {
  id: string;
  /** 모음은 위치가 꼭 있다(#297) */
  location: PhotoLocation;
  /** 모음 한마디(#309). 없으면 빈 문자열 */
  caption: string;
  /** 사용자가 붙인 장소 이름(#317). 없으면 빈 문자열 */
  placeName: string;
  photos: { id: string; takenAt: string | undefined; previewUrl: string | undefined }[];
}

/** `dates` + `photos` 조회 결과 한 행 */
export interface DetailRow {
  revision: string;
  id: string;
  date: string;
  end_date: string | null;
  title: string;
  memo: string | null;
  cover_photo_id: string | null;
  tags: string[];
  author: AuthorRow;
  /** 기록을 남긴 일정의 날(반복이면 그날). 직접 쓴 기록은 null */
  event_date: string | null;
  /** 기록을 남긴 일정. 직접 쓴 기록이거나 일정이 지워졌으면 null */
  event: { id: string; title: string; repeat_rule: string | null } | null;
  /** 기록의 사진 모음과 그 한마디(#309). 위치는 사진 행에 펴서 읽는다 */
  groups: { id: string; caption: string | null }[];
  photos: {
    id: string;
    group_id: string;
    path: string;
    thumb_path: string;
    sort_order: number;
    /** 사진이 속한 모음의 위치(#297). 모음은 위치가 꼭 있다 */
    place: string;
    place_lat: number;
    place_lng: number;
    /** 사진이 속한 모음에 사용자가 붙인 장소 이름(#317) */
    place_name: string | null;
    taken_at: string | null;
  }[];
}

const toUrlByPath = (signed: SignedUrl[]): Map<string, string> =>
  new Map(signed.flatMap(({ path, signedUrl }) => (path && signedUrl ? [[path, signedUrl] as const] : [])));

const toPhotoLocation = ({ place, place_lat: lat, place_lng: lng }: DetailRow["photos"][number]): PhotoLocation => ({ place, lat, lng });

/** 모음 id → 모음 한마디. 한마디가 없는 모음은 넣지 않는다 */
const toCaptionByGroupId = (groups: DetailRow["groups"]): Map<string, string> =>
  new Map(groups.flatMap(({ id, caption }) => (caption ? [[id, caption] as const] : [])));

/** 사진 순서대로 놓인 사진을 모음으로 묶어 모음마다 한마디를 붙인다 */
const toDetailGroups = (photos: DetailRow["photos"], captionByGroupId: Map<string, string>): DetailGroup[] =>
  groupPhotosInOrder(photos).map(([first]) => ({ id: first.group_id, caption: captionByGroupId.get(first.group_id) }));

const sortPhotos = (photos: DetailRow["photos"]): DetailRow["photos"] => photos.toSorted(comparePhotoOrder);

/**
 * 기록 상세에서 처음 펼칠 사진 행. 주소로 고른 사진이 없으면 사진 순서의 첫 사진이다(`findStartPhotoIndex`와 같은 기준).
 * 그 사진의 썸네일만 서명해 원본을 받는 동안 먼저 보여 준다(#313).
 *
 * @returns 사진이 없으면 undefined
 * @example findStartPhotoRow(row.photos, "p2")?.thumb_path // "r1/p2_thumb.jpg"
 */
export const findStartPhotoRow = (photos: DetailRow["photos"], photoId: string | undefined): DetailRow["photos"][number] | undefined => {
  const sorted = sortPhotos(photos);
  return sorted.find(({ id }) => id === photoId) ?? sorted[0];
};

/**
 * 조회한 행에 원본 서명 URL과 처음 펼칠 사진의 썸네일 서명 URL을 붙여 상세 화면 값으로 바꾼다. DB의 null은 화면 경계에서 undefined로 바꾼다.
 *
 * @param startPhotoId 주소로 고른 처음 펼칠 사진(`?photo=`). 없으면 첫 사진이다
 * @example toDateRecordDetail(row, signedUrls, startPhotoId)
 */
export const toDateRecordDetail = (row: DetailRow, signedPhotos: SignedUrl[], startPhotoId?: string): DateRecordDetail => {
  const urlByPath = toUrlByPath(signedPhotos);
  const photos = sortPhotos(row.photos);
  const startId = findStartPhotoRow(photos, startPhotoId)?.id;
  const linkedEvent =
    row.event && row.event_date
      ? {
          id: row.event.id,
          title: row.event.title,
          href: toEventEditHref({ id: row.event.id, date: row.event_date, repeatRule: isRepeatRule(row.event.repeat_rule) ? row.event.repeat_rule : undefined, period: undefined }),
        }
      : undefined;
  return {
    id: row.id,
    date: row.date,
    endDate: row.end_date ?? undefined,
    title: row.title,
    memo: row.memo ?? undefined,
    tags: row.tags,
    authorNickname: row.author?.nickname,
    eventHref: linkedEvent?.href,
    linkedEvent,
    photos: photos.map(({ id, group_id: groupId, path, thumb_path: thumbPath, place, place_name: placeName }) => ({
      id,
      groupId,
      url: urlByPath.get(path),
      thumbUrl: id === startId ? urlByPath.get(thumbPath) : undefined,
      place,
      placeName: placeName ?? undefined,
    })),
    groups: toDetailGroups(photos, toCaptionByGroupId(row.groups)),
    route: buildGroupRoute(photos),
  };
};

/** 사진 순서대로 놓인 사진을 모음으로 묶는다. 떨어진 같은 모음 사진도 한 모음으로 모아 고쳐 저장할 때 같은 모음 id를 두 번 넘기지 않는다 */
const toEditableGroups = ({
  photos,
  urlByPath,
  captionByGroupId,
}: {
  photos: DetailRow["photos"];
  urlByPath: Map<string, string>;
  captionByGroupId: Map<string, string>;
}): EditableGroup[] =>
  groupPhotosInOrder(photos).map((groupPhotos) => ({
    id: groupPhotos[0].group_id,
    location: toPhotoLocation(groupPhotos[0]),
    caption: captionByGroupId.get(groupPhotos[0].group_id) ?? "",
    placeName: groupPhotos[0].place_name ?? "",
    photos: groupPhotos.map((photo) => ({ id: photo.id, takenAt: photo.taken_at ?? undefined, previewUrl: urlByPath.get(photo.thumb_path) })),
  }));

/**
 * 조회한 행을 수정 화면 초기값으로 바꾼다. 미리보기는 썸네일 서명 URL을 쓴다.
 *
 * @example toEditableRecord(row, signedThumbs)
 */
export const toEditableRecord = (row: DetailRow, signedThumbs: SignedUrl[]): EditableRecord => {
  const urlByPath = toUrlByPath(signedThumbs);
  const photos = sortPhotos(row.photos);
  return {
    id: row.id,
    revision: row.revision,
    date: row.date,
    endDate: row.end_date ?? undefined,
    title: row.title,
    memo: row.memo ?? "",
    coverPhotoId: row.cover_photo_id ?? photos[0]?.id,
    tags: row.tags,
    groups: toEditableGroups({ photos, urlByPath, captionByGroupId: toCaptionByGroupId(row.groups) }),
  };
};
