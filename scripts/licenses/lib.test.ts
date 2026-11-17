import { describe, expect, it } from "vitest";
import { extractCopyrightLines, findLicenseFileName, sortLicenses, toAuthorName, toLicenseEntry, toLicenseName } from "./lib.mts";

const MIT_TEXT = [
  "MIT License",
  "",
  "Copyright (c) 2020 Supabase",
  "",
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  "The above copyright notice and this permission notice shall be included in all",
  "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
].join("\r\n");

describe("findLicenseFileName", () => {
  it("대소문자와 확장자가 달라도 라이선스 파일을 고른다", () => {
    // Arrange
    const fileNames = ["README.md", "license.md", "package.json", "dist"];

    // Act & Assert
    expect(findLicenseFileName(fileNames)).toBe("license.md");
  });

  it("LICENCE·COPYING·LICENSE-MIT도 라이선스 파일로 본다", () => {
    expect(findLicenseFileName(["LICENCE"])).toBe("LICENCE");
    expect(findLicenseFileName(["COPYING.txt"])).toBe("COPYING.txt");
    expect(findLicenseFileName(["LICENSE-MIT"])).toBe("LICENSE-MIT");
  });

  it("라이선스 파일이 없으면 undefined를 돌려준다", () => {
    expect(findLicenseFileName(["index.js", "package.json", "licenses.js"])).toBeUndefined();
  });

  it("여럿이면 이름순 첫 번째를 고른다", () => {
    expect(findLicenseFileName(["LICENSE.md", "LICENSE"])).toBe("LICENSE");
  });
});

describe("toLicenseName", () => {
  it("license 글자를 그대로 쓴다", () => {
    expect(toLicenseName({ name: "react", license: "MIT" })).toBe("MIT");
  });

  it("license가 { type } 모양이면 type을 쓴다", () => {
    expect(toLicenseName({ name: "old", license: { type: "BSD-3-Clause", url: "https://example.com" } })).toBe("BSD-3-Clause");
  });

  it("옛 licenses 배열이면 OR로 잇는다", () => {
    expect(toLicenseName({ name: "old", licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("MIT OR Apache-2.0");
  });

  it("라이선스가 적혀 있지 않으면 꾸러미 이름과 함께 빌드를 멈춘다", () => {
    expect(() => toLicenseName({ name: "nameless", license: "" })).toThrow("nameless: package.json에 라이선스가 없어요");
    expect(() => toLicenseName({ name: "nameless" })).toThrow("nameless");
  });
});

describe("extractCopyrightLines", () => {
  it("MIT 글에서 저작권 줄만 뽑고 본문의 copyright 낱말은 뺀다", () => {
    expect(extractCopyrightLines(MIT_TEXT)).toEqual(["Copyright (c) 2020 Supabase"]);
  });

  it("여러 줄과 (c)·©로 시작하는 줄을 순서대로 모으고 같은 줄은 한 번만 둔다", () => {
    // Arrange
    const text = "  Copyright 2015 Marco\n(c) 2019 Donald\n© 2020 Alex\nCopyright 2015 Marco";

    // Act & Assert
    expect(extractCopyrightLines(text)).toEqual(["Copyright 2015 Marco", "(c) 2019 Donald", "© 2020 Alex"]);
  });

  it("Apache 본문의 'copyright license'와 빈칸 양식 줄은 저작권 줄이 아니다", () => {
    // Arrange
    const text = ["copyright license to reproduce, prepare Derivative Works of,", "Copyright [yyyy] [name of copyright owner]", "copyright notice that is included in or attached to the work"].join(
      "\n",
    );

    // Act & Assert
    expect(extractCopyrightLines(text)).toEqual([]);
  });

  it("Apache 본문의 '(c) You must retain' 조항은 저작권 줄이 아니다", () => {
    // Arrange
    const text = "(b) You must cause any modified files to carry prominent notices\n(c) You must retain, in the Source form of any Derivative Works";

    // Act & Assert
    expect(extractCopyrightLines(text)).toEqual([]);
  });
});

describe("toAuthorName", () => {
  it("메일·주소를 빼고 이름만 남긴다", () => {
    expect(toAuthorName("Donald <donald@example.com> (https://example.com)")).toBe("Donald");
  });

  it("{ name } 모양에서도 이름을 읽는다", () => {
    expect(toAuthorName({ name: "David Jerleke", email: "d@example.com" })).toBe("David Jerleke");
  });

  it("없거나 이름이 비면 undefined를 돌려준다", () => {
    expect(toAuthorName(undefined)).toBeUndefined();
    expect(toAuthorName("<only@example.com>")).toBeUndefined();
  });
});

describe("toLicenseEntry", () => {
  it("버전·라이선스·저작권 줄·전문을 담고 줄바꿈은 \\n으로 맞춘다", () => {
    // Arrange & Act
    const entry = toLicenseEntry({
      name: "@supabase/supabase-js",
      packageJson: { name: "@supabase/supabase-js", version: "2.118.0", license: "MIT", author: "Supabase" },
      licenseText: `${MIT_TEXT}\r\n`,
    });

    // Assert: 저작권 줄이 있으면 만든 사람은 따로 두지 않는다
    expect(entry).toEqual({
      name: "@supabase/supabase-js",
      version: "2.118.0",
      license: "MIT",
      copyright: ["Copyright (c) 2020 Supabase"],
      text: MIT_TEXT.replaceAll("\r\n", "\n"),
    });
  });

  it("라이선스 파일이 없으면 전문 없이 만든 사람 이름을 둔다", () => {
    // Arrange & Act
    const entry = toLicenseEntry({
      name: "embla-carousel-react",
      packageJson: { version: "8.6.0", license: "MIT", author: "David Jerleke" },
      licenseText: undefined,
    });

    // Assert
    expect(entry).toEqual({ name: "embla-carousel-react", version: "8.6.0", license: "MIT", copyright: [], author: "David Jerleke" });
  });

  it("파일도 만든 사람도 없으면 이름·버전·라이선스만 둔다", () => {
    expect(toLicenseEntry({ name: "server-only", packageJson: { version: "0.0.1", license: "MIT" }, licenseText: undefined })).toEqual({
      name: "server-only",
      version: "0.0.1",
      license: "MIT",
      copyright: [],
    });
  });

  it("버전이 없으면 꾸러미 이름과 함께 빌드를 멈춘다", () => {
    expect(() => toLicenseEntry({ name: "broken", packageJson: { license: "MIT" }, licenseText: undefined })).toThrow("broken: package.json에 버전이 없어요");
  });

  it("라이선스 이름의 오류 문구에는 dependencies에 적힌 이름을 쓴다", () => {
    expect(() => toLicenseEntry({ name: "alias-name", packageJson: { name: "real-name", version: "1.0.0" }, licenseText: undefined })).toThrow("alias-name");
  });
});

describe("sortLicenses", () => {
  it("이름순(유니코드 순서)으로 늘어놓아 @로 시작하는 이름이 먼저 온다", () => {
    // Arrange
    const entry = (name: string) => ({ name, version: "1.0.0", license: "MIT", copyright: [] });

    // Act
    const sorted = sortLicenses([entry("react"), entry("@supabase/ssr"), entry("next"), entry("react-dom")]);

    // Assert
    expect(sorted.map(({ name }) => name)).toEqual(["@supabase/ssr", "next", "react", "react-dom"]);
  });
});
