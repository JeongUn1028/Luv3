import { countChars } from "@/lib/form";
import type { AlbumTile } from "./album";
import { isRecordId } from "./detail";

/** 기록 찾기 API 주소. 화면과 API 경로가 함께 쓴다 */
export const RECORD_SEARCH_PATH = "/api/records/search";

/** 한 번에 받는 기록 수. 맨 아래 가까이 가면 다음 묶음을 받는다 */
export const RECORD_SEARCH_PAGE_SIZE = 60;

/** 검색어·태그로 받는 글자 수 상한. 기록의 어떤 칸보다 길면 찾을 것이 없다 */
const SEARCH_TEXT_MAX_LENGTH = 100;

/** 다음 묶음을 받을 자리: 앞 묶음 마지막 기록의 날짜·작성 시각·id */
export interface RecordCursor {
  /** YYYY-MM-DD */
  date: string;
  /** DB가 준 그대로의 작성 시각. 마이크로초까지 있어 Date로 바꾸면 자리가 틀어진다 */
  createdAt: string;
  id: string;
}

/** 기록 찾기 조건 */
export interface RecordSearchParams {
  query: string;
  /** 고른 태그. 전체면 undefined */
  tag: string | undefined;
  /** 다음 묶음을 받을 자리. 첫 묶음이면 undefined */
  after: RecordCursor | undefined;
}

/** 찾은 기록 한 묶음 */
export interface RecordSearchPage {
  items: AlbumTile[];
  /** 묶음과 상관없이 맞는 기록 전체의 수 */
  total: number;
  /** 다음 묶음을 받을 자리. 더 없으면 undefined */
  next: RecordCursor | undefined;
}

/** 기록을 찾지 못했을 때. 우리 API의 상태 코드가 있으면 `status`에 담는다 */
export class RecordSearchError extends Error {
  readonly status: number | undefined;

  constructor(options?: ErrorOptions & { status?: number }) {
    super("기록을 찾지 못했어요.", options);
    this.name = "RecordSearchError";
    this.status = options?.status;
  }
}

/**
 * 검색어를 DB에 넘길 낱말로 나눈다. 띄어 쓴 낱말은 모두 들어 있어야 하고, 태그처럼 쓴 앞의 #은 뺀다.
 *
 * @example toSearchWords("  #카페  성수 ") // ["카페", "성수"]
 */
export const toSearchWords = (query: string): string[] =>
  query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^#+/, ""))
    .filter(Boolean);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const CURSOR_PARAMS = { date: "beforeDate", createdAt: "beforeCreatedAt", id: "beforeId" } as const;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

const isRecordCursor = (value: unknown): value is RecordCursor =>
  isObject(value) &&
  typeof value.date === "string" &&
  ISO_DATE_PATTERN.test(value.date) &&
  typeof value.createdAt === "string" &&
  TIMESTAMP_PATTERN.test(value.createdAt) &&
  typeof value.id === "string" &&
  isRecordId(value.id);

/**
 * 기록 찾기 API 주소. 빈 검색어·태그는 넣지 않는다.
 *
 * @example toRecordSearchApiHref({ query: "성수", tag: "카페", after: undefined }) // "/api/records/search?q=%EC%84%B1%EC%88%98&tag=..."
 */
export const toRecordSearchApiHref = ({ query, tag, after }: RecordSearchParams): string => {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (tag) params.set("tag", tag);
  if (after) {
    params.set(CURSOR_PARAMS.date, after.date);
    params.set(CURSOR_PARAMS.createdAt, after.createdAt);
    params.set(CURSOR_PARAMS.id, after.id);
  }
  return `${RECORD_SEARCH_PATH}?${params.toString()}`;
};

/**
 * 기록 찾기 API 주소의 조건을 읽는다. 너무 길거나 다음 자리가 잘못됐으면 undefined.
 *
 * @example parseRecordSearchParams(new URL(request.url).searchParams) // { query: "성수", tag: undefined, after: undefined }
 */
export const parseRecordSearchParams = (params: URLSearchParams): RecordSearchParams | undefined => {
  const query = params.get("q")?.trim() ?? "";
  const tag = params.get("tag") || undefined;
  if (countChars(query) > SEARCH_TEXT_MAX_LENGTH || (tag !== undefined && countChars(tag) > SEARCH_TEXT_MAX_LENGTH)) return undefined;

  const hasCursor = Object.values(CURSOR_PARAMS).some((name) => params.has(name));
  if (!hasCursor) return { query, tag, after: undefined };
  const after = { date: params.get(CURSOR_PARAMS.date), createdAt: params.get(CURSOR_PARAMS.createdAt), id: params.get(CURSOR_PARAMS.id) };
  return isRecordCursor(after) ? { query, tag, after } : undefined;
};

const isOptionalString = (value: unknown): value is string | undefined => value === undefined || typeof value === "string";

const isAlbumTile = (value: unknown): value is AlbumTile =>
  isObject(value) &&
  typeof value.id === "string" &&
  typeof value.date === "string" &&
  isOptionalString(value.endDate) &&
  typeof value.title === "string" &&
  isOptionalString(value.place) &&
  Array.isArray(value.tags) &&
  value.tags.every((tag) => typeof tag === "string") &&
  isOptionalString(value.thumbUrl);

/**
 * 우리 API(`RECORD_SEARCH_PATH`)의 응답을 읽는다. JSON은 undefined 칸을 빼고 보내므로 빠진 칸은 undefined로 읽는다.
 *
 * @throws {RecordSearchError} 응답 모양이 다를 때
 * @example parseRecordSearchPage(await response.json())
 */
export const parseRecordSearchPage = (body: unknown): RecordSearchPage => {
  if (!isObject(body) || !Array.isArray(body.items) || !body.items.every(isAlbumTile) || typeof body.total !== "number") {
    throw new RecordSearchError();
  }
  if (body.next !== undefined && !isRecordCursor(body.next)) throw new RecordSearchError();
  return { items: body.items, total: body.total, next: body.next };
};
