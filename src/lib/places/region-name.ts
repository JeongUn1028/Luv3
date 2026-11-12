/**
 * 행정동 이름의 차례 번호. 숫자(·, 로 이은 여러 개 포함)와 그 뒤의 "가"·숫자를 동 이름 끝(·, 동, 가) 앞에서 찾는다.
 * 차례를 뜻하는 "제"(상일제1동)는 앞에 두 글자 이상 있을 때만 함께 뗀다. 홍제1동·거제1동의 "제"는 이름의 일부다.
 * 앞 두 글자는 붙잡아 되돌려 둔다. 뒤를 보는 정규식(lookbehind)은 iOS 16.3 이하 Safari가 읽지 못해 쓰지 않는다
 */
const ORDINAL_PATTERN = /(?:([가-힣]{2})제)?\d+(?:[·,]\d+)*(?:가\d*(?:[·,]\d+)*)?(?=[·,동가]|$)/g;

// 숫자를 뗀 뒤 남는 이음표(두류1,2동 → 두류,동)를 정리한다
const tidySeparators = (name: string): string => name.replace(/[·,]+(?=동|$)/, "");

const shortenDong = (dong: string): string => tidySeparators(dong.replace(ORDINAL_PATTERN, "$1"));

// 행정동 이름은 "구 동"처럼 앞 낱말이 시·군·구이고 마지막 낱말이 동·읍·면이다.
// 아니면("찍은 곳", 예전에 직접 적은 "래미안아파트 101동") 다듬지 않는다
const splitRegionName = (place: string): { prefix: string[]; dong: string } | undefined => {
  const words = place.trim().split(/\s+/);
  const dong = words.at(-1);
  const prefix = words.slice(0, -1);
  const isRegion = prefix.length > 0 && prefix.every((word) => /[시군구]$/.test(word));
  return dong && isRegion && /[동읍면]$/.test(dong) ? { prefix, dong } : undefined;
};

/**
 * 행정동 이름을 우리가 부르는 짧은 동 이름으로 다듬는다. 저장된 이름은 그대로 두고 보여 줄 때만 쓴다(#317).
 * 구·시 이름은 빼고 마지막 동·읍·면 이름만 돌려준다. 동네 이름을 붙이지 못한 위치("찍은 곳")는 그대로다.
 *
 * @example toShortRegionName("성동구 성수1가1동") // "성수동"
 */
export const toShortRegionName = (place: string): string => {
  const region = splitRegionName(place);
  return region ? shortenDong(region.dong) : place;
};

/**
 * 행정동 이름에서 마지막 동 이름만 다듬고 구·시 이름은 둔다. 기록 폼의 위치 줄에 쓴다(#317).
 *
 * @example formatRegionName("성동구 성수1가1동") // "성동구 성수동"
 */
export const formatRegionName = (place: string): string => {
  const region = splitRegionName(place);
  return region ? [...region.prefix, shortenDong(region.dong)].join(" ") : place;
};
