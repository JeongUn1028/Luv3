/** 0~255 RGB 값 */
export type Rgb = readonly [number, number, number];

/**
 * `#rrggbb`를 RGB 값으로 바꾼다.
 *
 * @example parseHexColor("#f5cfd9") // [245, 207, 217]
 */
export const parseHexColor = (hex: string): Rgb => {
  const [, red, green, blue] = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? [];
  if (red === undefined || green === undefined || blue === undefined) throw new Error(`#rrggbb 형식이 아닙니다: ${hex}`);
  return [parseInt(red, 16), parseInt(green, 16), parseInt(blue, 16)];
};

/**
 * 반투명 색을 바탕색 위에 칠했을 때 보이는 색.
 *
 * @example blendColors({ foreground: pink, background: black, alpha: 0.35 })
 */
export const blendColors = ({ foreground, background, alpha }: { foreground: Rgb; background: Rgb; alpha: number }): Rgb => {
  const mix = (index: 0 | 1 | 2): number => foreground[index] * alpha + background[index] * (1 - alpha);
  return [mix(0), mix(1), mix(2)];
};

const toRelativeLuminance = (color: Rgb): number => {
  const toLinear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(color[0]) + 0.7152 * toLinear(color[1]) + 0.0722 * toLinear(color[2]);
};

/**
 * WCAG 대비 비율(1~21). 본문 글자 AA 기준은 4.5 이상이다.
 *
 * @example getContrastRatio(parseHexColor("#0a0a0a"), parseHexColor("#f5cfd9")) // 13.96…
 */
export const getContrastRatio = (first: Rgb, second: Rgb): number => {
  const [lighter, darker] = [toRelativeLuminance(first), toRelativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};
