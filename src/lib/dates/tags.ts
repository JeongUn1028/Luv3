import { countChars } from "@/lib/form";

/** 태그 하나의 글자 수 제한. DB check 제약(마이그레이션)과 같아야 한다 */
export const TAG_MAX_LENGTH = 10;
/** 기록 하나에 붙일 수 있는 태그 수 */
export const MAX_TAGS = 5;
/** 작성 화면에 추천할 태그 수 */
const TAG_SUGGESTION_LIMIT = 12;

/**
 * 적은 태그를 다듬는다. 앞의 #은 습관처럼 붙이므로 지운다.
 *
 * @example normalizeTag(" #카페 ") // "카페"
 */
export const normalizeTag = (text: string): string => text.trim().replace(/^[#\s]+/, "").replace(/\s+/g, " ");

const addOneTag = (tags: string[], text: string): { tags: string[]; error?: string } => {
  const tag = normalizeTag(text);
  const isSameTag = (existing: string): boolean => existing.toLowerCase() === tag.toLowerCase();
  if (tag === "" || tags.some(isSameTag)) return { tags };
  if (countChars(tag) > TAG_MAX_LENGTH) return { tags, error: `태그는 ${TAG_MAX_LENGTH}자까지 적을 수 있어요.` };
  if (tags.length >= MAX_TAGS) return { tags, error: `태그는 ${MAX_TAGS}개까지 붙일 수 있어요.` };
  return { tags: [...tags, tag] };
};

/**
 * 태그를 더한다. 습관대로 `#카페 #여행`처럼 적으면 각각 더한다.
 * 이미 있으면 그대로 두고, 글자 수나 개수를 넘으면 하나도 더하지 않고 이유를 함께 돌려준다.
 *
 * @example addTag(["카페"], "#여행") // { tags: ["카페", "여행"] }
 */
export const addTag = (tags: string[], text: string): { tags: string[]; error?: string } => {
  let nextTags = tags;
  for (const part of text.split("#")) {
    const { tags: added, error } = addOneTag(nextTags, part);
    if (error) return { tags, error };
    nextTags = added;
  }
  return { tags: nextTags };
};

/**
 * 전에 쓴 태그에서 보여 줄 것을 고른다. 이미 붙인 태그를 뺀 뒤에 잘라, 붙인 만큼 추천이 줄지 않게 한다.
 *
 * @example pickTagSuggestions(["cafe", "여행"], ["Cafe"]) // ["여행"]
 */
export const pickTagSuggestions = (suggestions: string[], tags: string[]): string[] => {
  const used = new Set(tags.map((tag) => tag.toLowerCase()));
  return suggestions.filter((suggestion) => !used.has(suggestion.toLowerCase())).slice(0, TAG_SUGGESTION_LIMIT);
};
