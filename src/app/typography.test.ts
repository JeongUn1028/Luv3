import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

// 주아와 고운돋움은 굵기가 하나뿐이다(#134). 굵게 지정하면 브라우저가 획을 두껍게 뭉갠 가짜 굵기를 그린다.
// Vitest(node)로는 글자 모양을 잴 수 없어 소스 규칙으로 고정한다.

// 루트 레이아웃까지 실패했을 때의 최후의 화면은 웹 글꼴 없이 진짜 굵기가 있는 시스템 글꼴로 그린다(#83)
const GLOBAL_ERROR = "app/global-error.tsx";

describe("글꼴", () => {
  it("제목·숫자는 주아, 본문은 고운돋움으로 불러온다", () => {
    const layout = readSource("app/layout.tsx");
    const css = readSource("app/globals.css");

    expect(layout).toMatch(/import \{ Gowun_Dodum, Jua \} from "next\/font\/google"/);
    // html에 변수를 넣지 않으면 글꼴 변수가 정의되지 않아 모든 글자가 시스템 글꼴로 떨어진다
    expect(layout).toMatch(/className=\{`\$\{gowunDodum\.variable\} \$\{jua\.variable\} /);
    expect(css).toMatch(/--font-sans: var\(--font-gowun-dodum\)/);
    expect(css).toMatch(/--font-display: var\(--font-jua\)/);
  });

  it("브라우저가 가짜 굵기를 만들지 않게 막는다", () => {
    expect(readSource("app/globals.css")).toMatch(/\bhtml\s*\{[^}]*\bfont-synthesis: none;/);
  });

  it("화면 코드에 굵기 클래스를 적지 않는다", () => {
    const weighted = readSourceLines().flatMap(({ at, lines }) =>
      at === GLOBAL_ERROR
        ? []
        : lines.flatMap((line, index) =>
            /(?<![\w-])font-(?:thin|extralight|light|medium|semibold|bold|extrabold|black|\[\d+\])(?![\w-])|font-weight|fontWeight/.test(line) ? [`${at}:${index + 1}`] : [],
          ),
    );

    expect(weighted).toEqual([]);
  });
});
