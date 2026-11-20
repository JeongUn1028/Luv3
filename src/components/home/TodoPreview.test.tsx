import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodoPreview } from "@/components/home/TodoPreview";

// 화면 모양은 캡처로 확인한다. Vitest(node)는 HTML로 그려 문구와 링크만 고정한다

/** 그린 HTML에서 태그를 지운 글자 */
const toText = (html: string): string => html.replace(/<[^>]+>/g, "");

describe("TodoPreview", () => {
  it("하지 않은 것이 모두 일정 잡혔으면 비었다고 하지 않고 모두 잡혔다고 알리며 목록으로 가는 링크를 둔다(#497)", () => {
    // Act
    const html = renderToStaticMarkup(<TodoPreview todos={[]} isAllScheduled />);

    // Assert
    expect(toText(html)).toContain("모두 일정이 잡혔어요");
    expect(toText(html)).not.toContain("적어 보세요");
    expect(html).toContain('href="/todos"');
    expect(html).not.toContain('href="/todos/new"');
  });

  it("하지 않은 것이 없으면 추가하라고 안내한다", () => {
    const html = renderToStaticMarkup(<TodoPreview todos={[]} />);

    expect(toText(html)).toContain("함께 하고 싶은 것을 적어 보세요");
    expect(html).toContain('href="/todos/new"');
  });
});
