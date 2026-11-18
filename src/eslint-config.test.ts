import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// 팀 규칙(company 컨벤션)을 린트가 지키게 한 설정(#359)이 켜져 있는지, 예시 코드로 확인한다
const eslint = new ESLint();

const findRules = async (code: string, filePath: string): Promise<(string | null)[]> => {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId);
};

describe("ESLint 팀 규칙", () => {
  it.each([
    ["any 타입을 쓰면", "export const parse = (value: any): string => String(value);\n", "@typescript-eslint/no-explicit-any"],
    ["non-null 단언(!)을 쓰면", "export const first = (values: string[] | undefined): number => values!.length;\n", "@typescript-eslint/no-non-null-assertion"],
    ["객체 리터럴을 타입 단언하면", "interface Point { x: number }\nexport const origin = { x: 0 } as Point;\n", "@typescript-eslint/consistent-type-assertions"],
    ["default export를 쓰면", "const value = 1;\nexport default value;\n", "import/no-default-export"],
  ])("%s 막는다", async (_, code, rule) => {
    // Act & Assert
    expect(await findRules(code, "src/lib/example.ts")).toContain(rule);
  }, 30_000);

  it("함수 선언으로 만든 컴포넌트는 막고 화살표 함수 컴포넌트는 받는다", async () => {
    // Arrange
    const declaration = 'import type { ReactElement } from "react";\nexport function Card(): ReactElement {\n  return <div />;\n}\n';
    const arrow = 'import type { ReactElement } from "react";\nexport const Card = (): ReactElement => <div />;\n';

    // Act & Assert
    expect(await findRules(declaration, "src/components/Card.tsx")).toContain("react/function-component-definition");
    expect(await findRules(arrow, "src/components/Card.tsx")).toEqual([]);
  }, 30_000);

  // Next가 default export로 읽는 화면 파일과 설정 파일은 예외다
  it.each(["src/app/settings/page.tsx", "src/app/layout.tsx", "src/app/not-found.tsx", "src/app/manifest.ts", "src/app/opengraph-image.tsx", "next.config.ts", "vitest.config.mts", "e2e/global-setup.ts"])(
    "%s는 default export를 쓸 수 있다",
    async (filePath) => {
      // Act & Assert
      expect(await findRules("const value = 1;\nexport default value;\n", filePath)).not.toContain("import/no-default-export");
    },
    30_000,
  );

  // 테스트의 가짜 객체는 필요한 칸만 채워 단언한다
  it("테스트 파일에서는 객체 리터럴 타입 단언을 쓸 수 있다", async () => {
    // Act & Assert
    expect(await findRules("interface Point { x: number }\nexport const origin = {} as Point;\n", "src/lib/example.test.ts")).toEqual([]);
  }, 30_000);
});
