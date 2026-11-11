import { toKstDate } from "@/lib/anniversary";
import type { SignedUrlWithExpiry } from "@/lib/photos/signed-urls";
import { isRecordId } from "./detail";

/** 지도 사진 API 주소. 핀의 썸네일과 아래 칸 사진 줄이 함께 쓴다(#249) */
export const MAP_PHOTOS_PATH = "/api/records/map-photos";

/** 한 번에 받는 사진 수 상한. 화면 안 핀의 썸네일도 이만큼씩 나눠 받는다 */
export const MAP_PHOTOS_MAX_IDS = 40;

/** 아래 칸 사진 줄을 한 번에 받는 수. 화면에는 두세 장이 보이고, 옆으로 넘겨 끝에 가까워지면 다음 묶음을 받는다 */
export const MAP_PHOTO_PAGE_SIZE = 12;

/** 지도에서 보여 줄 사진 하나 */
export interface MapPhoto {
  id: string;
  recordId: string;
  /** 사진이 속한 기록의 제목 */
  title: string;
  /** 기록 날짜(YYYY-MM-DD). 기간이면 시작일 */
  date: string;
  /** 찍은 시각(ISO). 사진 정보가 없었으면 undefined */
  takenAt: string | undefined;
  /** 썸네일 서명 주소. 받지 못했으면 undefined */
  thumbUrl: string | undefined;
  /** 썸네일 주소가 만료되는 시각(ms). 지도를 오래 열어 두면 이 시각 전에 다시 받는다 */
  expiresAt: number | undefined;
}

/** 로그인이 풀려 지도 사진을 받지 못했을 때의 `MapPhotosError.status` */
export const MAP_PHOTOS_UNAUTHORIZED_STATUS = 401;

/** 지도 사진을 받지 못했을 때. 우리 API의 상태 코드가 있으면 `status`에 담는다 */
export class MapPhotosError extends Error {
  readonly status: number | undefined;

  constructor(options?: ErrorOptions & { status?: number }) {
    super("사진을 불러오지 못했어요.", options);
    this.name = "MapPhotosError";
    this.status = options?.status;
  }
}

/**
 * 지도 사진 API 주소.
 *
 * @example toMapPhotosHref(["p1", "p2"]) // "/api/records/map-photos?ids=p1%2Cp2"
 */
export const toMapPhotosHref = (photoIds: string[]): string => `${MAP_PHOTOS_PATH}?${new URLSearchParams({ ids: photoIds.join(",") }).toString()}`;

/**
 * API 주소의 사진 id 목록을 읽는다. 쉼표로 나눈 1~40개의 id만 받고, 겹친 id는 하나로 친다. 형식이 틀리면 undefined.
 *
 * @example parseMapPhotoIds("p1,p2") // ["p1", "p2"] (실제로는 uuid)
 */
export const parseMapPhotoIds = (text: string | null): string[] | undefined => {
  if (!text) return undefined;
  const ids = [...new Set(text.split(","))];
  return ids.length <= MAP_PHOTOS_MAX_IDS && ids.every(isRecordId) ? ids : undefined;
};

/** `photos` 조회 결과 한 행 */
export interface MapPhotoDetailRow {
  id: string;
  thumb_path: string;
  taken_at: string | null;
  record: { id: string; title: string; date: string };
}

/**
 * 조회한 사진을 요청한 id 순서로 돌려준다. 그사이 지워진 사진은 뺀다. 서명은 썸네일 경로 순서와 같아야 한다.
 *
 * @example toMapPhotos(ids, rows, signed)
 */
export const toMapPhotos = (photoIds: string[], rows: MapPhotoDetailRow[], signedThumbs: SignedUrlWithExpiry[]): MapPhoto[] => {
  const signedByPath = new Map(signedThumbs.map((signed) => [signed.path, signed]));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return photoIds.flatMap((id) => {
    const row = rowsById.get(id);
    if (!row) return [];
    const signed = signedByPath.get(row.thumb_path);
    return [
      {
        id,
        recordId: row.record.id,
        title: row.record.title,
        date: row.record.date,
        takenAt: row.taken_at ?? undefined,
        thumbUrl: signed?.signedUrl ?? undefined,
        expiresAt: signed?.signedUrl ? signed.expiresAt : undefined,
      },
    ];
  });
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isOptionalString = (value: unknown): value is string | undefined => value === undefined || typeof value === "string";

const isMapPhoto = (value: unknown): value is MapPhoto =>
  isObject(value) &&
  typeof value.id === "string" &&
  typeof value.recordId === "string" &&
  typeof value.title === "string" &&
  typeof value.date === "string" &&
  isOptionalString(value.takenAt) &&
  isOptionalString(value.thumbUrl) &&
  (value.expiresAt === undefined || typeof value.expiresAt === "number");

/**
 * 우리 API(`MAP_PHOTOS_PATH`)의 응답을 읽는다. JSON은 undefined 칸을 빼고 보내므로 빠진 칸은 undefined로 읽는다.
 *
 * @throws {MapPhotosError} 응답 모양이 다를 때
 * @example parseMapPhotos(await response.json())
 */
export const parseMapPhotos = (body: unknown): MapPhoto[] => {
  if (!isObject(body) || !Array.isArray(body.items) || !body.items.every(isMapPhoto)) throw new MapPhotosError();
  return body.items;
};

const KST_TIME_FORMAT = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });

/**
 * 사진 줄의 날짜 표기. 찍은 시각이 있으면 그 날짜와 시각(한국 시각), 없으면 기록 날짜만 쓴다.
 *
 * @example formatMapPhotoDate({ date: "2026-11-10", takenAt: "2026-11-10T05:03:22Z" }) // "2026.11.10 · 오후 2:03"
 */
export const formatMapPhotoDate = ({ date, takenAt }: Pick<MapPhoto, "date" | "takenAt">): string => {
  if (!takenAt) return date.replaceAll("-", ".");
  const taken = new Date(takenAt);
  return `${toKstDate(taken).replaceAll("-", ".")} · ${KST_TIME_FORMAT.format(taken)}`;
};

/** 휴대폰이 기억해 둔 썸네일 주소 */
export interface CachedThumb {
  url: string;
  expiresAt: number;
}

/** 받아 둔 주소는 만료까지 이만큼 넘게 남아야 다시 쓴다. 받는 사이 만료되지 않게 둔다 */
const THUMB_MIN_REMAINING_MS = 5 * 60 * 1000;

/**
 * 화면 안 낱개 핀의 대표 사진 중, 받아 둔 주소로 바로 그릴 것과 새로 받을 것을 가른다.
 * 받는 중인 사진과 받아 봤지만 주소가 없던 사진(그사이 지워짐, 서명 실패)은 다시 받지 않는다. 새로 받을 것은 API 상한(40장)씩 나눈다.
 *
 * @example const { ready, batches } = planThumbRequests({ photoIds, cached, pending, unavailable, now: Date.now() })
 */
export const planThumbRequests = ({
  photoIds,
  cached,
  pending,
  unavailable,
  now,
}: {
  photoIds: string[];
  cached: ReadonlyMap<string, CachedThumb>;
  pending: ReadonlySet<string>;
  unavailable: ReadonlySet<string>;
  now: number;
}): { ready: [string, string][]; batches: string[][] } => {
  const ready: [string, string][] = [];
  const missing: string[] = [];
  for (const id of new Set(photoIds)) {
    const thumb = cached.get(id);
    if (thumb && thumb.expiresAt - now > THUMB_MIN_REMAINING_MS) ready.push([id, thumb.url]);
    else if (!pending.has(id) && !unavailable.has(id)) missing.push(id);
  }
  const batches: string[][] = [];
  for (let start = 0; start < missing.length; start += MAP_PHOTOS_MAX_IDS) batches.push(missing.slice(start, start + MAP_PHOTOS_MAX_IDS));
  return { ready, batches };
};
