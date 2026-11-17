// 앱 정보 화면의 업데이트 기록(#434). GitHub 릴리스 노트에서 사람이 쓴 맨 위 요약만 떼어 보여 준다(#404 "정한 것")
import { toKstDate } from "@/lib/anniversary";
import { isObject } from "@/lib/guards";

/** 요약 한 줄. 목록 항목은 "**이름**: 글" 모양이면 이름을 따로 둔다 */
export type ReleaseNote = { kind: "item"; label: string | undefined; text: string } | { kind: "paragraph"; text: string };

export interface AppRelease {
  /** 앞의 `v`를 뺀 버전(예: "1.2.0") */
  version: string;
  /** 릴리스한 날(한국 날짜, YYYY-MM-DD) */
  publishedOn: string;
  notes: ReleaseNote[];
}

// GitHub가 붙이는 자동 목록. 이 줄부터는 PR 제목이라 보여 주지 않는다
const AUTO_LIST_START = /^##\s+What's Changed/m;
// 이슈·PR 번호가 든 괄호. 앱을 쓰는 사람에게는 뜻이 없어 뺀다(예: "(#366·#367)", "(#343에서 고쳐요)")
const ISSUE_REFERENCE = /\s*\([^()]*#\d+[^()]*\)/g;
const LIST_ITEM = /^[-*]\s+/;
const LABELED_ITEM = /^\*\*(.+?)\*\*\s*:?\s*(.*)$/;

// 굵게(**) 표시는 목록 이름에만 쓰고 나머지 글에서는 표시만 지운다
const toPlainText = (line: string): string => line.replace(ISSUE_REFERENCE, "").replaceAll("**", "").trim();

const toNote = (line: string): ReleaseNote | undefined => {
  if (line === "" || line.startsWith("#")) return undefined;
  if (!LIST_ITEM.test(line)) return { kind: "paragraph", text: toPlainText(line) };
  const item = line.replace(LIST_ITEM, "");
  const labeled = LABELED_ITEM.exec(item);
  return labeled ? { kind: "item", label: labeled[1], text: toPlainText(labeled[2] ?? "") } : { kind: "item", label: undefined, text: toPlainText(item) };
};

/**
 * 릴리스 노트에서 자동 목록(`## What's Changed`) 앞의 요약만 떼어 줄마다 나눈다. 제목 줄은 빼고 이슈 번호 괄호도 지운다.
 *
 * @example toReleaseNotes("## 1.2.0에서 바뀐 것\n- **지도**: 숫자를 고쳤어요(#362)")
 * // [{ kind: "item", label: "지도", text: "숫자를 고쳤어요" }]
 */
export const toReleaseNotes = (body: string): ReleaseNote[] => {
  const summary = body.split(AUTO_LIST_START)[0] ?? "";
  return summary
    .split(/\r?\n/)
    .map((line) => toNote(line.trim()))
    .filter((note) => note !== undefined);
};

const toKoreanDate = (isoTime: string): string | undefined => {
  const time = Date.parse(isoTime);
  return Number.isNaN(time) ? undefined : toKstDate(new Date(time));
};

const toRelease = (value: unknown): AppRelease | undefined => {
  // 임시 릴리스는 날짜(published_at)가 null이라 모양을 보기 전에 뺀다
  if (!isObject(value) || value.draft === true || value.prerelease === true) return undefined;
  if (typeof value.tag_name !== "string" || typeof value.published_at !== "string") return undefined;
  const publishedOn = toKoreanDate(value.published_at);
  if (!publishedOn) return undefined;
  const notes = typeof value.body === "string" ? toReleaseNotes(value.body) : [];
  return { version: value.tag_name.replace(/^v/, ""), publishedOn, notes };
};

/**
 * GitHub Releases API(`GET /repos/{owner}/{repo}/releases`)의 답을 읽는다. 임시·미리 보기 릴리스와 모양이 다른 항목은 빼고 나머지를 보여 준다.
 * 답이 목록이 아니면(요청 한도 초과 안내 등) `undefined`.
 *
 * @example const releases = parseReleases(await response.json());
 */
export const parseReleases = (value: unknown): AppRelease[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.map(toRelease).filter((release) => release !== undefined);
};

/**
 * 릴리스한 날을 화면에 적는 모양으로 바꾼다.
 *
 * @example formatReleaseDate("2026-11-16") // "2026년 11월 16일"
 */
export const formatReleaseDate = (publishedOn: string): string => {
  const [year, month, day] = publishedOn.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
};
