/** 지도 위 사진 핀 하나. 썸네일 주소는 화면에 보일 때 따로 받아 넣는다 */
export interface PhotoPinElement {
  element: HTMLButtonElement;
  /** 대표 사진 썸네일을 그린다. 같은 주소면 다시 받지 않는다 */
  showPhoto: (url: string) => void;
}

/**
 * 사진 동그라미 핀 요소를 만든다(#249 시안: 사진 동그라미 + 분홍 장수). 카카오 지도의 CustomOverlay 안에 들어가
 * React가 그리지 않으므로 DOM으로 직접 만든다. 썸네일이 오기 전에는 빈 동그라미다.
 *
 * @example const pin = createPhotoPinElement({ label: "성수 사진 4장", count: 4, onPress: () => open(spot.key) })
 */
export const createPhotoPinElement = ({ label, count, onPress }: { label: string; count: number; onPress: () => void }): PhotoPinElement => {
  const element = document.createElement("button");
  element.type = "button";
  element.ariaLabel = label;
  element.className = "press-icon relative block size-[52px] rounded-full border-[3px] border-white bg-surface shadow-[0_2px_6px_rgba(0,0,0,0.35)]";
  element.addEventListener("click", onPress);

  const image = document.createElement("img");
  image.alt = "";
  image.draggable = false;
  image.className = "size-full rounded-full object-cover";
  image.hidden = true;
  // 받지 못한 사진은 깨진 그림 대신 빈 동그라미로 둔다
  image.addEventListener("error", () => {
    image.hidden = true;
  });
  element.append(image);

  if (count > 1) {
    const badge = document.createElement("span");
    badge.ariaHidden = "true";
    badge.className =
      "absolute -top-1.5 -right-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 font-display text-[12px] text-background";
    badge.textContent = count.toString();
    element.append(badge);
  }

  return {
    element,
    showPhoto: (url) => {
      if (image.getAttribute("src") === url) return;
      image.src = url;
      image.hidden = false;
    },
  };
};
