/** 지도 위 사진 핀 하나. 썸네일 주소는 화면에 보일 때 따로 받아 넣는다 */
export interface PhotoPinElement {
  element: HTMLButtonElement;
  /** 대표 사진 썸네일을 그린다. 같은 주소면 다시 받지 않는다 */
  showPhoto: (url: string) => void;
}

/** 사진을 받기 전·받지 못했을 때의 핀 바탕. 사진을 보이면 뺀다 */
const COUNT_BACKGROUND_CLASS = "bg-accent";

/**
 * 사진 동그라미 핀 요소를 만든다(#249 시안: 사진 동그라미 + 분홍 장수). 카카오 지도의 CustomOverlay 안에 들어가
 * React가 그리지 않으므로 DOM으로 직접 만든다. 사진을 받기 전과 받지 못했을 때는 묶음 동그라미처럼 분홍 바탕 가운데에
 * 장수를 보여 1장짜리 핀도 빈 핀처럼 보이지 않게 하고, 사진이 다 받아지면 사진과 오른쪽 위 장수 표시(2장 이상)로 바꾼다(#331).
 * 테두리 없이 그림자만 두고, 묶음 동그라미(40px)와는 크기(52px)로 구분한다.
 *
 * @example const pin = createPhotoPinElement({ label: "성수 사진 4장", count: 4, onPress: () => open(spot.key) })
 */
export const createPhotoPinElement = ({ label, count, onPress }: { label: string; count: number; onPress: () => void }): PhotoPinElement => {
  const element = document.createElement("button");
  element.type = "button";
  element.ariaLabel = label;
  element.className = `press-icon relative flex size-[52px] items-center justify-center rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.4)] ${COUNT_BACKGROUND_CLASS}`;
  element.addEventListener("click", onPress);

  // 숫자는 묶음 동그라미처럼 주아로 쓴다. 주아는 굵기가 하나뿐이라 굵게 하지 않는다(#134)
  const centerCount = document.createElement("span");
  centerCount.ariaHidden = "true";
  centerCount.className = "font-display text-[16px] leading-none text-background";
  centerCount.textContent = count.toString();

  const image = document.createElement("img");
  image.alt = "";
  image.draggable = false;
  image.className = "absolute inset-0 size-full rounded-full object-cover";
  image.hidden = true;

  const badge = count > 1 ? document.createElement("span") : undefined;
  if (badge) {
    badge.ariaHidden = "true";
    badge.className =
      "absolute -top-1.5 -right-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 font-display text-[12px] text-background";
    badge.textContent = count.toString();
    badge.hidden = true;
  }

  const setPhotoShown = (isShown: boolean): void => {
    image.hidden = !isShown;
    centerCount.hidden = isShown;
    if (badge) badge.hidden = !isShown;
    element.classList.toggle(COUNT_BACKGROUND_CLASS, !isShown);
  };
  // 다 받은 뒤에 사진으로 바꿔 받는 동안 빈 동그라미가 보이지 않게 한다. 받지 못한 사진은 깨진 그림 대신 장수로 되돌린다
  image.addEventListener("load", () => setPhotoShown(true));
  image.addEventListener("error", () => setPhotoShown(false));

  element.append(centerCount, image);
  if (badge) element.append(badge);

  return {
    element,
    showPhoto: (url) => {
      if (image.getAttribute("src") === url) return;
      image.src = url;
    },
  };
};
