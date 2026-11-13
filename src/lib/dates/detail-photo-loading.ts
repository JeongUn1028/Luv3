/**
 * 기록 상세에서 사진 칸 하나를 언제 받을지(#313).
 * - `now`: 지금 보는 사진. 바로 받는다
 * - `next`: 지금 사진의 앞뒤 한 장. 지금 사진을 다 받은 뒤에 미리 받는다
 * - `later`: 아직 받지 않는다. 넘겨서 가까워지면 받는다
 */
export type SlidePhotoLoad = "now" | "next" | "later";

interface ToSlidePhotoLoadParams {
  index: number;
  /** 지금 보는 사진의 순서 */
  selectedIndex: number;
  /** 지금 보는 사진을 다 받았는지(받을 주소가 없으면 받은 것으로 친다) */
  isSelectedShown: boolean;
}

/**
 * 사진 칸을 언제 받을지 고른다. 앞뒤 사진이 지금 사진과 회선을 나눠 쓰지 않도록, 지금 사진을 다 받은 뒤에 미리 받는다.
 *
 * @example toSlidePhotoLoad({ index: 3, selectedIndex: 2, isSelectedShown: true }) // "next"
 */
export const toSlidePhotoLoad = ({ index, selectedIndex, isSelectedShown }: ToSlidePhotoLoadParams): SlidePhotoLoad => {
  if (index === selectedIndex) return "now";
  if (isSelectedShown && Math.abs(index - selectedIndex) === 1) return "next";
  return "later";
};
