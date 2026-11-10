import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { createSignedUrlCache, type SignedUrl } from "@/lib/photos/signed-urls";
import { createClient } from "@/lib/supabase/client";

/** 일정에 이을 수 있는 이미 쓴 기록(#237). "기록 남기기" 창의 후보 */
export interface LinkableRecord {
  id: string;
  /** 기간이면 시작일 */
  date: string;
  /** 기간의 끝 날짜. 하루짜리면 undefined */
  endDate: string | undefined;
  title: string;
  /** 대표 사진 썸네일 서명 주소. 받지 못했으면 사진 없이 그린다 */
  thumbUrl: string | undefined;
}

/** `dates` + 대표 사진 조회 결과 한 행 */
export interface LinkableRecordRow {
  id: string;
  date: string;
  end_date: string | null;
  title: string;
  cover: { thumb_path: string } | null;
}

/** 일정의 그날. 기간 일정이면 시작일부터 끝 날짜까지(양 끝 포함, YYYY-MM-DD) */
export interface EventDaySpan {
  start: string;
  end: string;
}

/** 후보 기록을 불러오지 못했을 때 */
export class LinkableRecordLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("이미 쓴 기록을 불러오지 못했어요.", options);
    this.name = "LinkableRecordLoadError";
  }
}

/** 잇거나 끊지 못했을 때. 메시지는 화면에 그대로 보여 줄 문구다 */
export class EventLinkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EventLinkError";
  }
}

const LINK_FAILURE_MESSAGES: Record<string, string> = {
  // 낡은 화면에서 누르는 사이 상대가 그날 기록을 남기거나 이은 경우
  P0410: "이 일정의 그날에는 이미 이어진 기록이 있어요.",
  P0411: "이미 다른 일정과 이어진 기록이에요.",
  P0002: "기록이나 일정이 지워졌어요. 화면을 새로 고쳐 주세요.",
  // 그사이 일정을 한 사람 일정으로 바꾸거나 날짜를 옮긴 경우
  "22023": "이 일정과 이을 수 없는 기록이에요.",
};

const UNKNOWN_FAILURE_MESSAGE = "잇지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * `link_date_record`의 거절 코드를 화면 문구로 바꾼다.
 *
 * @example toLinkFailureMessage("P0410") // "이 일정의 그날에는 이미 이어진 기록이 있어요."
 */
export const toLinkFailureMessage = (code: string | undefined): string => (code && LINK_FAILURE_MESSAGES[code]) || UNKNOWN_FAILURE_MESSAGE;

/**
 * 잇기·끊기에서 잡은 오류를 화면 문구로 바꾼다. `EventLinkError`가 아니면(예상 못한 오류) 다시 해 보라고 한다.
 *
 * @example setMessage(toEventLinkMessage(error))
 */
export const toEventLinkMessage = (error: unknown): string => (error instanceof EventLinkError ? error.message : UNKNOWN_FAILURE_MESSAGE);

/**
 * 후보 기록 행에 썸네일 주소를 붙인다. DB의 null은 화면 경계에서 undefined로 바꾼다.
 *
 * @example toLinkableRecords(rows, signedThumbs)
 */
export const toLinkableRecords = (rows: LinkableRecordRow[], signedThumbs: SignedUrl[]): LinkableRecord[] => {
  const urlByPath = new Map(signedThumbs.flatMap(({ path, signedUrl }) => (path && signedUrl ? [[path, signedUrl] as const] : [])));
  return rows.map(({ id, date, end_date, title, cover }) => ({
    id,
    date,
    endDate: end_date ?? undefined,
    title,
    thumbUrl: cover ? urlByPath.get(cover.thumb_path) : undefined,
  }));
};

// 창을 다시 열 때 같은 주소를 써서 브라우저가 썸네일을 다시 받지 않게 한다
const getThumbUrls = createSignedUrlCache();

/**
 * 일정의 그날과 기간이 겹치고 아직 어느 일정과도 이어지지 않은 기록을 날짜 순서로 읽는다.
 * 썸네일 주소를 받지 못해도 고를 수는 있어 사진 없이 돌려준다.
 *
 * @throws {LinkableRecordLoadError} 기록 조회가 실패했을 때
 * @example const records = await fetchLinkableRecords({ start: "2026-11-01", end: "2026-11-01" })
 */
export const fetchLinkableRecords = async ({ start, end }: EventDaySpan): Promise<LinkableRecord[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dates")
    .select("id, date, end_date, title, cover:photos!dates_cover_photo_id_fkey(thumb_path)")
    .is("event_id", null)
    .lte("date", end)
    // coalesce(end_date, date) >= start와 같다. 끝 날짜는 있으면 늘 시작일보다 뒤다(dates_end_date_after_date)
    .or(`date.gte.${start},end_date.gte.${start}`)
    .order("date")
    .order("created_at");
  if (error) throw new LinkableRecordLoadError({ cause: error });

  const thumbPaths = data.flatMap(({ cover }) => (cover ? [cover.thumb_path] : []));
  if (thumbPaths.length === 0) return toLinkableRecords(data, []);
  const signed = await getThumbUrls(supabase.storage.from(ALBUM_BUCKET), thumbPaths);
  if (signed.error) console.error(signed.error);
  return toLinkableRecords(data, signed.data ?? []);
};

/**
 * 이미 쓴 기록을 일정의 그날에 잇는다. 이미 그렇게 이어져 있으면 그대로 끝난다.
 *
 * @throws {EventLinkError} 잇지 못했을 때. 메시지는 화면 문구다
 * @example await linkRecordToEvent({ recordId, eventId, eventDate: "2026-11-01" })
 */
export const linkRecordToEvent = async ({ recordId, eventId, eventDate }: { recordId: string; eventId: string; eventDate: string }): Promise<void> => {
  const { error } = await createClient().rpc("link_date_record", { p_date_id: recordId, p_event_id: eventId, p_event_date: eventDate });
  if (error) throw new EventLinkError(toLinkFailureMessage(error.code), { cause: error });
};

/**
 * 기록과 일정의 연결만 끊는다. 화면이 본 일정과 지금 이어진 일정이 다르면(그사이 다시 이은 경우) 끊지 않는다.
 *
 * @throws {EventLinkError} 끊지 못했을 때. 메시지는 화면 문구다
 * @example await unlinkRecordFromEvent({ recordId, eventId })
 */
export const unlinkRecordFromEvent = async ({ recordId, eventId }: { recordId: string; eventId: string }): Promise<void> => {
  const { error } = await createClient().rpc("unlink_date_record", { p_date_id: recordId, p_event_id: eventId });
  if (error) {
    throw new EventLinkError(
      error.code === "P0002" ? "기록이 지워졌어요. 화면을 새로 고쳐 주세요." : "연결을 끊지 못했어요. 잠시 후 다시 시도해 주세요.",
      { cause: error },
    );
  }
};
