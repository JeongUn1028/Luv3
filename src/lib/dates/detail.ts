import type { PlaceLocation } from "@/lib/places/search";
import type { PhotoLocation } from "./form";
import type { AuthorRow } from "@/lib/author";
import type { SignedUrl } from "@/lib/photos/signed-urls";
import { isRepeatRule } from "@/lib/events/calendar";
import { toEventEditHref } from "@/lib/events/recurrence";
import { formatPeriodMonthDay, toMonthDay, type RecordPeriod } from "./album";

export interface DetailPhoto {
  id: string;
  /** 원본(긴 변 2000px) 서명 URL. 받지 못했으면 빈 칸으로 그린다 */
  url: string | undefined;
  caption: string | undefined;
  /** 사진을 찍은 곳의 이름(#249). 없으면 장소 줄을 그리지 않는다 */
  place: string | undefined;
}

/** 기록 상세에서 처음 펼칠 사진을 고르는 주소 이름(`/dates/<id>?photo=<사진 id>`) */
export const RECORD_PHOTO_PARAM = "photo";

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
  place: string | undefined;
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
  /** 기록을 지울 때 함께 지울 Storage 파일(원본·썸네일) */
  filePaths: string[];
}

/** 수정 화면 초기값. 글은 입력칸에 바로 넣도록 빈 값을 빈 문자열로 둔다 */
export interface EditableRecord {
  id: string;
  /** 불러온 때의 판 번호. 저장할 때 보내 그사이 바뀌었는지 확인한다 */
  revision: string;
  date: string;
  endDate: string | undefined;
  title: string;
  place: string;
  memo: string;
  coverPhotoId: string | undefined;
  tags: string[];
  location: PlaceLocation | undefined;
  /** 이미 저장된 사진. 미리보기는 썸네일 서명 URL */
  photos: { id: string; caption: string; location: PhotoLocation | undefined; previewUrl: string | undefined }[];
}

/** `dates` + `photos` 조회 결과 한 행 */
export interface DetailRow {
  revision: string;
  id: string;
  date: string;
  end_date: string | null;
  title: string;
  place: string | null;
  memo: string | null;
  cover_photo_id: string | null;
  tags: string[];
  place_lat: number | null;
  place_lng: number | null;
  author: AuthorRow;
  /** 기록을 남긴 일정의 날(반복이면 그날). 직접 쓴 기록은 null */
  event_date: string | null;
  /** 기록을 남긴 일정. 직접 쓴 기록이거나 일정이 지워졌으면 null */
  event: { id: string; title: string; repeat_rule: string | null } | null;
  photos: {
    id: string;
    path: string;
    thumb_path: string;
    caption: string | null;
    sort_order: number;
    place: string | null;
    place_lat: number | null;
    place_lng: number | null;
  }[];
}

const toUrlByPath = (signed: SignedUrl[]): Map<string, string> =>
  new Map(signed.flatMap(({ path, signedUrl }) => (path && signedUrl ? [[path, signedUrl] as const] : [])));

// 이름과 좌표는 DB 제약으로 함께 있거나 함께 없다
const toPhotoLocation = ({ place, place_lat: lat, place_lng: lng }: DetailRow["photos"][number]): PhotoLocation | undefined =>
  place !== null && lat !== null && lng !== null ? { place, lat, lng } : undefined;

const sortPhotos = (photos: DetailRow["photos"]): DetailRow["photos"] =>
  photos.toSorted((a, b) => a.sort_order - b.sort_order);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 주소의 기록 id가 UUID 형식인지 확인한다. 형식이 틀리면 DB에 묻지 않고 바로 "없는 기록"으로 처리한다
 * (uuid 컬럼에 다른 문자열을 넘기면 DB가 22P02 에러를 낸다).
 *
 * @example isRecordId("5a87e560-6a6e-49be-8af3-db196468143c") // true
 */
export const isRecordId = (id: string): boolean => UUID_PATTERN.test(id);

/**
 * 조회한 행에 원본 서명 URL을 붙여 상세 화면 값으로 바꾼다. DB의 null은 화면 경계에서 undefined로 바꾼다.
 *
 * @example toDateRecordDetail(row, signedUrls)
 */
export const toDateRecordDetail = (row: DetailRow, signedPhotos: SignedUrl[]): DateRecordDetail => {
  const urlByPath = toUrlByPath(signedPhotos);
  const photos = sortPhotos(row.photos);
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
    place: row.place ?? undefined,
    memo: row.memo ?? undefined,
    tags: row.tags,
    authorNickname: row.author?.nickname,
    eventHref: linkedEvent?.href,
    linkedEvent,
    photos: photos.map(({ id, path, caption, place }) => ({ id, url: urlByPath.get(path), caption: caption ?? undefined, place: place ?? undefined })),
    filePaths: photos.flatMap(({ path, thumb_path }) => [path, thumb_path]),
  };
};

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
    place: row.place ?? "",
    memo: row.memo ?? "",
    coverPhotoId: row.cover_photo_id ?? photos[0]?.id,
    tags: row.tags,
    location: row.place_lat !== null && row.place_lng !== null ? { lat: row.place_lat, lng: row.place_lng } : undefined,
    photos: photos.map((photo) => ({
      id: photo.id,
      caption: photo.caption ?? "",
      location: toPhotoLocation(photo),
      previewUrl: urlByPath.get(photo.thumb_path),
    })),
  };
};

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("ko-KR", { weekday: "long", timeZone: "UTC" });

const toWeekday = (isoDate: string): string => WEEKDAY_FORMAT.format(new Date(`${isoDate}T00:00:00Z`));

/**
 * 상세 화면 날짜 표기: "2026.11.02 월요일". 날짜만 있는 값이라 시간대 영향을 받지 않게 UTC로 요일을 구한다.
 *
 * @example formatRecordDate("2026-11-02") // "2026.11.02 월요일"
 */
export const formatRecordDate = (isoDate: string): string => `${isoDate.replaceAll("-", ".")} ${toWeekday(isoDate)}`;

/**
 * 좁은 칸에 쓰는 기록 날짜: 연도 없이 MM.DD와 요일.
 *
 * @example formatRecordMonthDay("2026-11-02") // "11.02 월요일"
 */
export const formatRecordMonthDay = (isoDate: string): string => `${toMonthDay(isoDate)} ${toWeekday(isoDate)}`;

/**
 * 상세 화면 날짜 표기. 기간이면 끝 날짜를 덧붙이고, 해가 같으면 끝 날짜의 연도는 뺀다.
 *
 * @example formatRecordPeriod({ date: "2026-10-31", endDate: "2026-11-02" }) // "2026.10.31 토요일 – 11.02 월요일"
 */
export const formatRecordPeriod = ({ date, endDate }: RecordPeriod): string => {
  if (!endDate) return formatRecordDate(date);
  const isSameYear = date.slice(0, 4) === endDate.slice(0, 4);
  return `${formatRecordDate(date)} – ${isSameYear ? formatRecordMonthDay(endDate) : formatRecordDate(endDate)}`;
};

/**
 * 좁은 칸(홈 최근 데이트)에 쓰는 기록 날짜. 하루짜리는 요일까지, 기간은 그리드와 같은 표기로 쓴다.
 *
 * @example formatRecordShortDate({ date: "2026-11-01", endDate: "2026-11-03" }) // "11.01–11.03"
 */
export const formatRecordShortDate = ({ date, endDate }: RecordPeriod): string =>
  endDate ? formatPeriodMonthDay({ date, endDate }) : formatRecordMonthDay(date);
