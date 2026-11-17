/**
 * 라이선스 전문을 화면에 보일 문단으로 나눈다(#436). 라이선스 파일은 80자에서 줄을 바꿔 두어 그대로 그리면
 * 좁은 화면에서 줄이 어색하게 끊기므로, 빈 줄로 문단을 나누고 문단 안의 줄바꿈은 띄어쓰기로 잇는다.
 *
 * @example toLicenseParagraphs("MIT License\n\nPermission is hereby granted\nto any person") // ["MIT License", "Permission is hereby granted to any person"]
 */
export const toLicenseParagraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .join(" "),
    )
    .filter((paragraph) => paragraph !== "");
