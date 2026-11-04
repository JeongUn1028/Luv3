import type { AuthorRow } from "@/lib/author";
import type { SignedThumb } from "./album";

export interface DetailPhoto {
  id: string;
  /** 원본(긴 변 2000px) 서명 URL. 받지 못했으면 빈 칸으로 그린다 */
  url: string | undefined;
  caption: string | undefined;
}

/** 기록 상세 화면에 그리는 값 */
export interface DateRecordDetail {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  place: string | undefined;
  memo: string | undefined;
  /** 작성자 닉네임. 읽지 못했으면 작성자 표시를 그리지 않는다 */
  authorNickname: string | undefined;
  /** sort_order 순서 */
  photos: DetailPhoto[];
  /** 기록을 지울 때 함께 지울 Storage 파일(원본·썸네일) */
  filePaths: string[];
}

/** 수정 화면 초기값. 글은 입력칸에 바로 넣도록 빈 값을 빈 문자열로 둔다 */
export interface EditableRecord {
  id: string;
  date: string;
  title: string;
  place: string;
  memo: string;
  coverPhotoId: string | undefined;
  /** 이미 저장된 사진. 미리보기는 썸네일 서명 URL */
  photos: { id: string; caption: string; previewUrl: string | undefined }[];
}

/** `dates` + `photos` 조회 결과 한 행 */
export interface DetailRow {
  id: string;
  date: string;
  title: string;
  place: string | null;
  memo: string | null;
  cover_photo_id: string | null;
  author: AuthorRow;
  photos: { id: string; path: string; thumb_path: string; caption: string | null; sort_order: number }[];
}

const toUrlByPath = (signed: SignedThumb[]): Map<string, string> =>
  new Map(signed.flatMap(({ path, signedUrl }) => (path && signedUrl ? [[path, signedUrl] as const] : [])));

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
export const toDateRecordDetail = (row: DetailRow, signedPhotos: SignedThumb[]): DateRecordDetail => {
  const urlByPath = toUrlByPath(signedPhotos);
  const photos = sortPhotos(row.photos);
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    place: row.place ?? undefined,
    memo: row.memo ?? undefined,
    authorNickname: row.author?.nickname,
    photos: photos.map(({ id, path, caption }) => ({ id, url: urlByPath.get(path), caption: caption ?? undefined })),
    filePaths: photos.flatMap(({ path, thumb_path }) => [path, thumb_path]),
  };
};

/**
 * 조회한 행을 수정 화면 초기값으로 바꾼다. 미리보기는 썸네일 서명 URL을 쓴다.
 *
 * @example toEditableRecord(row, signedThumbs)
 */
export const toEditableRecord = (row: DetailRow, signedThumbs: SignedThumb[]): EditableRecord => {
  const urlByPath = toUrlByPath(signedThumbs);
  const photos = sortPhotos(row.photos);
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    place: row.place ?? "",
    memo: row.memo ?? "",
    coverPhotoId: row.cover_photo_id ?? photos[0]?.id,
    photos: photos.map(({ id, caption, thumb_path }) => ({
      id,
      caption: caption ?? "",
      previewUrl: urlByPath.get(thumb_path),
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
export const formatRecordMonthDay = (isoDate: string): string => `${isoDate.slice(5).replace("-", ".")} ${toWeekday(isoDate)}`;
