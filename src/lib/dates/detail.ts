import type { AuthorRow } from "@/lib/author";
import { toRememberablePhoto, type RememberablePhoto } from "@/lib/photos/remembered-url";
import { toSignedByPath, type SignedUrl, type SignedUrlWithExpiry } from "@/lib/photos/signed-urls";
import { isRepeatRule } from "@/lib/events/calendar";
import { toEventEditHref } from "@/lib/events/recurrence";
import { comparePhotoOrder, groupPhotosInOrder } from "./photo-groups";
import { buildGroupRoute, type PhotoRoute } from "./route";

export interface DetailPhoto {
  id: string;
  /** 사진이 속한 모음. 지금 보는 모음의 한마디를 찾을 때 쓴다(#309) */
  groupId: string;
  /** 원본(긴 변 2000px). 휴대폰이 경로로 주소를 기억해 다시 쓴다(#354). 받지 못했으면 빈 칸으로 그린다 */
  original: RememberablePhoto | undefined;
  /** 썸네일(긴 변 600px). 처음 펼칠 사진에만 있고, 원본을 받는 동안 먼저 보여 준다(#313) */
  thumb: RememberablePhoto | undefined;
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

/**
 * 서명 결과를 파일 경로 → 서명 URL로 바꾼다. 서명하지 못한 경로는 넣지 않는다.
 *
 * @example toUrlByPath(signed).get("r1/p1.jpg") // "https://..."
 */
export const toUrlByPath = (signed: SignedUrl[]): Map<string, string> =>
  new Map(signed.flatMap(({ path, signedUrl }) => (path && signedUrl ? [[path, signedUrl] as const] : [])));

/**
 * 모음 id → 모음 한마디. 한마디가 없는 모음은 넣지 않는다.
 *
 * @example toCaptionByGroupId(row.groups).get("g1") // "카페"
 */
export const toCaptionByGroupId = (groups: DetailRow["groups"]): Map<string, string> =>
  new Map(groups.flatMap(({ id, caption }) => (caption ? [[id, caption] as const] : [])));

/** 사진 순서대로 놓인 사진을 모음으로 묶어 모음마다 한마디를 붙인다 */
const toDetailGroups = (photos: DetailRow["photos"], captionByGroupId: Map<string, string>): DetailGroup[] =>
  groupPhotosInOrder(photos).map(([first]) => ({ id: first.group_id, caption: captionByGroupId.get(first.group_id) }));

/**
 * 사진 행을 모음 순서·모음 안 순서대로 놓는다.
 *
 * @example sortPhotos(row.photos)[0]?.id // "p1"
 */
export const sortPhotos = (photos: DetailRow["photos"]): DetailRow["photos"] => photos.toSorted(comparePhotoOrder);

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
 * 조회한 행에 원본과 처음 펼칠 사진의 썸네일의 경로·서명 URL·만료 시각을 붙여 상세 화면 값으로 바꾼다. DB의 null은 화면 경계에서 undefined로 바꾼다.
 *
 * @param startPhotoId 주소로 고른 처음 펼칠 사진(`?photo=`). 없으면 첫 사진이다
 * @example toDateRecordDetail(row, signedUrls, startPhotoId)
 */
export const toDateRecordDetail = (row: DetailRow, signedPhotos: SignedUrlWithExpiry[], startPhotoId?: string): DateRecordDetail => {
  const signedByPath = toSignedByPath(signedPhotos);
  const toPhoto = (path: string) => toRememberablePhoto(signedByPath.get(path));
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
      original: toPhoto(path),
      thumb: id === startId ? toPhoto(thumbPath) : undefined,
      place,
      placeName: placeName ?? undefined,
    })),
    groups: toDetailGroups(photos, toCaptionByGroupId(row.groups)),
    route: buildGroupRoute(photos),
  };
};
