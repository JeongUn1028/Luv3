/**
 * 저장 중이라 흐리게 그린 항목이 저장이 끝나 원래 색으로 바뀔 때의 전환(#345). 할 일 목록과 캘린더가 같이 쓴다.
 *
 * @example <span className={`text-ink ${SETTLE_TRANSITION_CLASS_NAME}`} />
 */
export const SETTLE_TRANSITION_CLASS_NAME = "transition-[color,opacity] duration-200 motion-reduce:transition-none";
