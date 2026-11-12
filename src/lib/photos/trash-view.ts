import { SETTINGS_TRASH_PATH } from "@/lib/auth/paths";
import { countDaysBetween, toKstDate } from "@/lib/anniversary";
import { formatCommentTime } from "@/lib/comments/comment";
import type { SignedUrl } from "./signed-urls";
import { countTrashDaysLeft } from "./trash";

/** 휴지통 화면이 읽는 `photo_trash` 행 */
export interface TrashRow {
  id: string;
  date_id: string;
  path: string;
  thumb_path: string;
  /** 지울 때 옮겨 둔 기록 날짜·제목. 기록을 읽지 못한 채 지워졌으면 null */
  record_date: string | null;
  record_title: string | null;
  taken_at: string | null;
  deleted_with_record: boolean;
  deleted_at: string;
}

/** 휴지통 그리드의 사진 칸 하나 */
export interface TrashPhotoTile {
  id: string;
  /** 썸네일 서명 주소. 서명하지 못했으면 빈 칸으로 그린다 */
  thumbUrl: string | undefined;
  daysLeft: number;
}

/** 같은 기록에서 같은 날 같은 방법으로 지운 사진 묶음 */
export interface TrashSection {
  key: string;
  /** 예: "11월 10일 · 성수 산책" */
  title: string;
  /** 예: "어제 지움 · 기록째 삭제" */
  deletedLabel: string;
  photos: TrashPhotoTile[];
}

/** 휴지통 사진 한 장을 여는 화면의 값 */
export interface TrashPhotoDetail {
  id: string;
  /** 원본 서명 주소. 서명하지 못했으면 빈 칸으로 그리고 저장 버튼을 숨긴다 */
  url: string | undefined;
  title: string;
  /** 예: "11월 10일 오후 3:12". 찍은 시각을 모르면 undefined */
  takenLabel: string | undefined;
  daysLeft: number;
  /** 휴대폰에 저장할 때의 파일 이름 */
  fileName: string;
}

/** 남은 날을 쓰는 자리: 그리드 칸 표시(badge), 칸을 읽어 주는 이름(label), 사진 화면 위(sentence) */
type DaysLeftForm = "badge" | "label" | "sentence";

const DAYS_LEFT_TEXT: Record<DaysLeftForm, { left: (days: number) => string; due: string }> = {
  badge: { left: (days) => `${days}일`, due: "곧" },
  label: { left: (days) => `${days}일 남음`, due: "곧 지워짐" },
  sentence: { left: (days) => `${days}일 남았어요`, due: "곧 지워져요" },
};

/**
 * 남은 날 문구. 기간이 지나 다음 매달 1일 정리를 기다리는 사진(0일)은 "곧 지워진다"고 쓴다.
 *
 * @example formatTrashDaysLeft(29, "badge") // "29일"
 */
export const formatTrashDaysLeft = (daysLeft: number, form: DaysLeftForm): string => {
  const text = DAYS_LEFT_TEXT[form];
  return daysLeft > 0 ? text.left(daysLeft) : text.due;
};

/** "11월 10일". 올해가 아니면 "2025년 12월 30일" */
const formatKoreanDate = (isoDate: string, today: string): string => {
  const [year, month, day] = isoDate.split("-");
  const monthDay = `${Number(month)}월 ${Number(day)}일`;
  return year === today.slice(0, 4) ? monthDay : `${year}년 ${monthDay}`;
};

const formatRecordLabel = ({ record_date: date, record_title: title }: TrashRow, today: string): string => {
  if (!title) return date ? formatKoreanDate(date, today) : "제목 없는 기록";
  return date ? `${formatKoreanDate(date, today)} · ${title}` : title;
};

const formatDeletedDay = (deletedDate: string, today: string): string => {
  const daysAgo = countDaysBetween(deletedDate, today);
  if (daysAgo === 0) return "오늘";
  if (daysAgo === 1) return "어제";
  return formatKoreanDate(deletedDate, today);
};

const toUrlByPath = (signed: SignedUrl[]): Map<string, string> =>
  new Map(signed.flatMap(({ path, signedUrl }) => (path && signedUrl ? [[path, signedUrl] as const] : [])));

/**
 * 휴지통 행을 기록·지운 날(한국 날짜)·지운 방법마다 묶고 사진마다 썸네일 주소와 남은 날을 붙인다.
 * 묶음과 묶음 안 사진은 받은 순서(최근에 지운 순)를 지킨다.
 *
 * @example toTrashSections(rows, signedThumbs, new Date())
 */
export const toTrashSections = (rows: TrashRow[], signedThumbs: SignedUrl[], now: Date): TrashSection[] => {
  const today = toKstDate(now);
  const urlByPath = toUrlByPath(signedThumbs);
  const sections = new Map<string, TrashSection>();
  for (const trashRow of rows) {
    const deletedDate = toKstDate(new Date(trashRow.deleted_at));
    const key = `${trashRow.date_id}:${deletedDate}:${trashRow.deleted_with_record ? "record" : "photo"}`;
    const section = sections.get(key) ?? {
      key,
      title: formatRecordLabel(trashRow, today),
      deletedLabel: `${formatDeletedDay(deletedDate, today)} 지움 · ${trashRow.deleted_with_record ? "기록째 삭제" : "사진 빼기"}`,
      photos: [],
    };
    section.photos.push({
      id: trashRow.id,
      thumbUrl: urlByPath.get(trashRow.thumb_path),
      daysLeft: countTrashDaysLeft({ deletedAt: trashRow.deleted_at, now }),
    });
    sections.set(key, section);
  }
  return [...sections.values()];
};

const toFileExtension = (path: string): string => {
  const fileName = path.split("/").at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(dotIndex + 1) : "jpg";
};

/**
 * 휴지통 사진 한 장을 여는 화면의 값을 만든다. 파일 이름은 기록 날짜(없으면 지운 날)와 사진 id 앞 8자로 짓는다.
 *
 * @example toTrashPhotoDetail(row, signedOriginals, new Date())
 */
export const toTrashPhotoDetail = (trashRow: TrashRow, signedOriginals: SignedUrl[], now: Date): TrashPhotoDetail => {
  const fileDate = trashRow.record_date ?? toKstDate(new Date(trashRow.deleted_at));
  return {
    id: trashRow.id,
    url: toUrlByPath(signedOriginals).get(trashRow.path),
    title: formatRecordLabel(trashRow, toKstDate(now)),
    takenLabel: trashRow.taken_at ? formatCommentTime(trashRow.taken_at, now) : undefined,
    daysLeft: countTrashDaysLeft({ deletedAt: trashRow.deleted_at, now }),
    fileName: `luv3-${fileDate}-${trashRow.id.slice(0, 8)}.${toFileExtension(trashRow.path)}`,
  };
};

/**
 * 휴지통 사진 한 장을 여는 주소.
 *
 * @example toTrashPhotoHref("t1") // "/settings/trash/t1"
 */
export const toTrashPhotoHref = (id: string): string => `${SETTINGS_TRASH_PATH}/${id}`;
