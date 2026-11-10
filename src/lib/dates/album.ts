import { toRememberablePhoto, type RememberablePhoto } from "@/lib/photos/remembered-url";
import type { SignedUrl, SignedUrlWithExpiry } from "@/lib/photos/signed-urls";

/** 기록 탭(앨범 그리드) 주소 */
export const RECORDS_PATH = "/records";

/** 기록 칸에 공통으로 그리는 내용(사진 주소 제외) */
interface RecordTileBase {
  id: string;
  /** YYYY-MM-DD. 기간이면 시작일 */
  date: string;
  /** 기간의 끝 날짜. 하루짜리면 undefined */
  endDate: string | undefined;
  title: string;
  place: string | undefined;
  tags: string[];
}

/** 앨범 그리드 칸 하나 = 기록 하나(대표 사진 썸네일) */
export interface AlbumTile extends RecordTileBase {
  /** 대표 사진 썸네일의 서명 URL. 받지 못했으면 빈 칸으로 그린다 */
  thumbUrl: string | undefined;
}

/** 홈의 최근 데이트 칸 */
export interface LatestRecord extends RecordTileBase {
  /** 대표 사진 썸네일. 휴대폰이 경로로 주소를 기억해 다시 쓴다(#219). 받지 못했으면 빈 칸으로 그린다 */
  thumb: RememberablePhoto | undefined;
}

/** 한 달치 묶음 */
export interface AlbumMonth {
  /** YYYY-MM */
  key: string;
  /** home.svg 표기: "2026 · 11" */
  label: string;
  tiles: AlbumTile[];
}

/** `dates` 조회 결과 한 행(대표 사진은 `cover_photo_id` FK로 붙인다) */
export interface AlbumRow {
  id: string;
  date: string;
  end_date: string | null;
  title: string;
  place: string | null;
  tags: string[];
  cover: { thumb_path: string } | null;
}

// DB의 null은 화면 경계에서 undefined로 바꾼다
const toRecordTileBase = (row: Omit<AlbumRow, "cover">): RecordTileBase => ({
  id: row.id,
  date: row.date,
  endDate: row.end_date ?? undefined,
  title: row.title,
  place: row.place ?? undefined,
  tags: row.tags,
});

/**
 * 조회한 기록 행에 썸네일 서명 URL을 붙여 그리드 칸으로 바꾼다. DB의 null은 화면 경계에서 undefined로 바꾼다.
 *
 * @example toAlbumTiles(rows, signedUrls) // [{ id, date, title, place, thumbUrl }]
 */
export const toAlbumTiles = (rows: AlbumRow[], signedThumbs: SignedUrl[]): AlbumTile[] => {
  const urlByPath = new Map(
    signedThumbs.flatMap(({ path, signedUrl }) => (path && signedUrl ? [[path, signedUrl] as const] : [])),
  );
  return rows.map(({ cover, ...row }) => ({ ...toRecordTileBase(row), thumbUrl: cover ? urlByPath.get(cover.thumb_path) : undefined }));
};

/**
 * 가장 최근 기록 행을 홈의 최근 데이트 칸으로 바꾼다. 썸네일에는 경로와 만료 시각을 함께 붙인다.
 *
 * @returns 기록이 없으면 undefined
 * @example toLatestRecord(rows, signedThumbs) // { id, title, thumb: { path, url, expiresAt }, ... }
 */
export const toLatestRecord = (rows: AlbumRow[], signedThumbs: SignedUrlWithExpiry[]): LatestRecord | undefined => {
  const [row] = rows;
  if (!row) return undefined;

  const { cover } = row;
  return { ...toRecordTileBase(row), thumb: cover ? toRememberablePhoto(signedThumbs.find(({ path }) => path === cover.thumb_path)) : undefined };
};

/**
 * 최신순으로 받은 칸을 달마다 묶는다. 달 안의 순서는 받은 순서를 지킨다. 기간 기록은 시작일이 속한 달에 넣는다.
 *
 * @example groupByMonth(tiles) // [{ key: "2026-11", label: "2026 · 11", tiles: [...] }]
 */
export const groupByMonth = (tiles: AlbumTile[]): AlbumMonth[] => {
  const months: AlbumMonth[] = [];
  for (const tile of tiles) {
    const key = tile.date.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.tiles.push(tile);
    else months.push({ key, label: key.replace("-", " · "), tiles: [tile] });
  }
  return months;
};

/** 기록의 날짜 값. 끝 날짜가 없으면 하루짜리다 */
export type RecordPeriod = Pick<AlbumTile, "date" | "endDate">;

/**
 * 연도 없는 월.일.
 *
 * @example toMonthDay("2026-11-02") // "11.02"
 */
export const toMonthDay = (isoDate: string): string => isoDate.slice(5).replace("-", ".");

/**
 * 연도 없는 짧은 날짜 표기. 기간이면 시작과 끝을 잇는다.
 *
 * @example formatPeriodMonthDay({ date: "2026-10-31", endDate: "2026-11-02" }) // "10.31–11.02"
 */
export const formatPeriodMonthDay = ({ date, endDate }: RecordPeriod): string =>
  endDate ? `${toMonthDay(date)}–${toMonthDay(endDate)}` : toMonthDay(date);

/**
 * 그리드 칸 아래쪽 글자: "11.02 · 성수동". 장소가 없으면 날짜만.
 *
 * @example formatTileLabel(tile) // "11.02 · 성수동"
 */
export const formatTileLabel = ({ date, endDate, place }: Pick<AlbumTile, "date" | "endDate" | "place">): string => {
  const period = formatPeriodMonthDay({ date, endDate });
  return place ? `${period} · ${place}` : period;
};

/** 태그 하나를 쓴 기록 수. DB(`count_date_tags`)가 대소문자만 다른 태그를 하나로 묶어 센다 */
export interface TagCount {
  tag: string;
  count: number;
}

/**
 * 센 태그를 많이 쓴 순서로 줄 세운다. 수가 같으면 가나다순이다.
 *
 * @example toTagSuggestions([{ tag: "여행", count: 1 }, { tag: "카페", count: 2 }]) // ["카페", "여행"]
 */
export const toTagSuggestions = (counts: TagCount[]): string[] =>
  counts.toSorted((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, "ko")).map(({ tag }) => tag);
