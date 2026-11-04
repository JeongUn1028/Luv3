/** 기록 탭(앨범 그리드) 주소 */
export const RECORDS_PATH = "/records";

/** 앨범 그리드 칸 하나 = 기록 하나(대표 사진 썸네일) */
export interface AlbumTile {
  id: string;
  /** YYYY-MM-DD. 기간이면 시작일 */
  date: string;
  /** 기간의 끝 날짜. 하루짜리면 undefined */
  endDate: string | undefined;
  title: string;
  place: string | undefined;
  /** 대표 사진 썸네일의 서명 URL. 받지 못했으면 빈 칸으로 그린다 */
  thumbUrl: string | undefined;
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
  cover: { thumb_path: string } | null;
}

/** `storage.createSignedUrls` 결과 중 쓰는 값 */
export interface SignedThumb {
  path: string | null;
  signedUrl: string | null;
}

/**
 * 조회한 기록 행에 썸네일 서명 URL을 붙여 그리드 칸으로 바꾼다. DB의 null은 화면 경계에서 undefined로 바꾼다.
 *
 * @example toAlbumTiles(rows, signedUrls) // [{ id, date, title, place, thumbUrl }]
 */
export const toAlbumTiles = (rows: AlbumRow[], signedThumbs: SignedThumb[]): AlbumTile[] => {
  const urlByPath = new Map(
    signedThumbs.flatMap(({ path, signedUrl }) => (path && signedUrl ? [[path, signedUrl] as const] : [])),
  );
  return rows.map(({ id, date, end_date, title, place, cover }) => ({
    id,
    date,
    endDate: end_date ?? undefined,
    title,
    place: place ?? undefined,
    thumbUrl: cover ? urlByPath.get(cover.thumb_path) : undefined,
  }));
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
