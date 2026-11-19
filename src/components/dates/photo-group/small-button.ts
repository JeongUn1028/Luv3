// 모음 카드 안의 작은 글자 버튼(사진 순서·대표·빼기, 사진 더하기, 위치 고르기)이 같이 쓰는 모양.
// 보이는 크기는 36px로 두고 누르는 영역만 44px로 넓힌다. 버튼 사이 간격(8px)을 반씩 나눠 가져 서로 겹치지 않는다(#105).
// 가상 요소는 테두리 안쪽을 기준으로 놓이므로 테두리 1px을 더해 5px 넓힌다. 테두리 없는 위치 고르기 버튼은 46px이 되지만 옆에 버튼이 없어 겹치지 않는다

/**
 * 36px 작은 버튼의 크기·모서리·누르는 영역. 색·테두리·글자 크기는 쓰는 곳에서 덧붙인다.
 *
 * @example <button className={`${SMALL_BUTTON_CLASS_NAME} border border-line px-3 text-[12px]`}>위치 바꾸기</button>
 */
export const SMALL_BUTTON_CLASS_NAME = "press-icon relative h-9 rounded-[8px] after:absolute after:-inset-[5px]";
