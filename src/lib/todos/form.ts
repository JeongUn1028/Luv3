import { countChars } from "@/lib/form";

// 글자 수 제한은 DB check 제약(마이그레이션)과 같아야 한다
export const TODO_CONTENT_MAX_LENGTH = 100;

/**
 * 저장 전에 하고 싶은 것 내용을 확인한다. 앞뒤 공백은 빼고 센다. 문제가 없으면 undefined다.
 *
 * @example validateTodoContent("") // "하고 싶은 것을 적어 주세요."
 */
export const validateTodoContent = (content: string): string | undefined => {
  const trimmed = content.trim();
  if (trimmed === "") return "하고 싶은 것을 적어 주세요.";
  if (countChars(trimmed) > TODO_CONTENT_MAX_LENGTH) return "100자까지 적을 수 있어요.";
  return undefined;
};
