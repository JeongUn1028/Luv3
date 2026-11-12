import { flushSync } from "react-dom";

interface RunKeepingFocusParams {
  /** 누른 버튼 */
  button: HTMLElement;
  /** 목록을 바꾸는 동작(빼기, 붙이기, 순서 바꾸기) */
  change: () => void;
  /** 누른 버튼이 목록 항목(`li`)과 함께 사라지면, 다음(없으면 이전) 항목에서 초점을 받을 버튼 */
  neighborSelector?: string;
  /** 이웃 항목도 없을 때 초점을 받을 곳 */
  fallback?: HTMLElement | null;
}

/**
 * 목록을 바꾼 뒤에도 초점을 지킨다. 바꾼 결과를 바로 그린 뒤, 누른 버튼이 남아 있으면 그 버튼에, 사라졌으면 이웃 항목의 같은 버튼에 초점을 준다.
 * 그대로 두면 사라진 버튼이나 다시 꽂힌 항목(Safari는 옮긴 노드의 초점을 뺀다)에서 초점이 문서 처음으로 빠져 키보드·화면 읽기 프로그램 사용자가 자리를 잃는다.
 * 그린 뒤에 옮기므로 화면 읽기 프로그램이 바뀐 이름("모음 1 아래로 옮기기")을 읽고, 붙이기가 거절돼 버튼이 남으면 초점도 그대로다.
 * 버튼에 초점이 있었을 때만 옮긴다. 아이폰 Safari는 버튼을 눌러도 초점을 주지 않으므로, 입력 칸으로 옮겨 키보드가 갑자기 열리지 않는다.
 *
 * @example
 * runKeepingFocus({ button: event.currentTarget, change: () => onRemove(tag), neighborSelector: "[data-tag-remove]", fallback: inputRef.current });
 */
export const runKeepingFocus = ({ button, change, neighborSelector, fallback }: RunKeepingFocusParams): void => {
  const hadFocus = document.activeElement === button;
  const item = button.closest("li");
  // 그린 뒤에는 사라진 항목의 이웃을 찾을 수 없어 미리 찾는다. 이웃 항목은 key가 같아 그린 뒤에도 같은 노드다
  const neighbor = neighborSelector
    ? (item?.nextElementSibling?.querySelector<HTMLElement>(neighborSelector) ?? item?.previousElementSibling?.querySelector<HTMLElement>(neighborSelector))
    : undefined;
  flushSync(change);
  if (!hadFocus || document.activeElement === button) return;
  if (button.isConnected) button.focus();
  else (neighbor ?? fallback)?.focus();
};
