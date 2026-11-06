// 작게 그린 태그도 쉽게 누르도록 44px 누름 영역을 가상 요소로 넓히고, 한 글자 태그도 가로 44px을 지킨다.
// 넓히는 기준이 테두리 안쪽이라 테두리 두께만큼 더 넓힌다. 여러 줄이면 넓힌 영역이 겹치지 않게 줄 사이를 18px 벌린다.
// 고를 때 크기가 변해 옆 태그가 밀리지 않도록 채운 태그에도 보이지 않는 테두리를 둔다
const CHIP_CLASS_NAME =
  "press-icon relative flex h-[26px] min-w-11 shrink-0 items-center justify-center rounded-[4px] border px-2 text-[13px] whitespace-nowrap after:absolute after:-inset-x-px after:-inset-y-[10px] disabled:opacity-50";

/** 붙인 태그, 고른 태그 */
export const FILLED_TAG_CHIP_CLASS_NAME = `${CHIP_CLASS_NAME} border-transparent bg-highlight/16 text-highlight`;

/** 고를 수 있는 태그 */
export const OUTLINED_TAG_CHIP_CLASS_NAME = `${CHIP_CLASS_NAME} border-line text-ink-sub`;
