import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextAreaField, TextField } from "@/components/FormField";
import { readSourceLines } from "@/test-utils/source";

const FORM_FIELD_FILE = "components/FormField.tsx";

// 화면 모양과 실제 입력은 E2E가 확인한다. Vitest(node)는 HTML로 그려 화면 읽기 연결과 규칙만 고정한다

const noop = (): void => undefined;

/** 그린 HTML에서 한 요소의 속성 값 */
const readAttribute = (html: string, tag: string, name: string): string | undefined =>
  new RegExp(`<${tag}\\b[^>]*\\s${name}="([^"]*)"`).exec(html)?.[1];

describe("TextField", () => {
  it("오류가 있으면 칸이 오류 문구를 가리키고 오류로 표시된다", () => {
    // Arrange
    const field = <TextField id="title" label="제목" value="" error="제목을 적어 주세요." onChange={noop} />;

    // Act
    const html = renderToStaticMarkup(field);

    // Assert
    expect(readAttribute(html, "input", "aria-invalid")).toBe("true");
    expect(readAttribute(html, "input", "aria-describedby")).toBe("title-error");
    expect(readAttribute(html, "p", "id")).toBe("title-error");
  });

  it("오류가 없으면 오류 문구를 그리지 않고 가리키지도 않는다", () => {
    // Arrange
    const field = <TextField id="title" label="제목" value="" onChange={noop} />;

    // Act
    const html = renderToStaticMarkup(field);

    // Assert
    expect(readAttribute(html, "input", "aria-invalid")).toBe("false");
    expect(readAttribute(html, "input", "aria-describedby")).toBeUndefined();
    expect(html).not.toContain("<p");
  });

  it("이름이 칸을 가리키고 흐린 글씨는 괄호로 붙는다", () => {
    // Arrange
    const field = <TextField id="place" label="장소" hint="선택" value="" onChange={noop} />;

    // Act
    const html = renderToStaticMarkup(field);

    // Assert
    expect(readAttribute(html, "label", "for")).toBe("place");
    expect(html.replace(/<[^>]+>/g, "")).toBe("장소 (선택)");
  });
});

describe("TextAreaField", () => {
  it("글자 수 같은 설명이 있으면 설명 뒤에 오류 문구를 함께 가리킨다", () => {
    // Arrange
    const field = (
      <TextAreaField
        id="memo"
        label="정리 글"
        aside={<span id="memo-count">0/2000</span>}
        describedBy="memo-count"
        value=""
        error="2,000자까지 적을 수 있어요."
        onChange={noop}
      />
    );

    // Act
    const html = renderToStaticMarkup(field);

    // Assert
    expect(readAttribute(html, "textarea", "aria-describedby")).toBe("memo-count memo-error");
  });
});

/** 공통 입력 칸 밖에서 이 글자가 나오는 곳 */
const findOutsideFormField = (pattern: RegExp): string[] =>
  readSourceLines().flatMap(({ at, lines }) =>
    at === FORM_FIELD_FILE ? [] : lines.flatMap((line, index) => (pattern.test(line) ? [`${at}:${index + 1}`] : [])),
  );

describe("공통 입력 칸 규칙", () => {
  it("51px 입력 칸의 테두리·초점 모양은 공통 입력 칸에서만 정한다", () => {
    // 폼마다 같은 클래스를 다시 적으면 한 곳만 바뀌어 칸 모양이 어긋난다(#172)
    expect(findOutsideFormField(/h-\[51px\].*focus:border-accent/)).toEqual([]);
  });

  it("칸 아래 오류 문구 모양은 공통 입력 칸에서만 정한다", () => {
    expect(findOutsideFormField(/mt-2 text-\[12px\] text-accent/)).toEqual([]);
  });
});
