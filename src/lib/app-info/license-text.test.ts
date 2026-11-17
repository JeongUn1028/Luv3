import { describe, expect, it } from "vitest";
import { toLicenseParagraphs } from "./license-text";

describe("toLicenseParagraphs", () => {
  it("빈 줄로 문단을 나누고, 문단 안의 줄바꿈은 띄어쓰기로 잇는다", () => {
    // Arrange: 라이선스 파일은 80자에서 줄을 바꿔 두어, 좁은 화면에서는 줄이 어색하게 끊긴다
    const text = "MIT License\n\nCopyright (c) 2020 Supabase\n\nPermission is hereby granted, to any person obtaining a copy\nof this software";

    // Act & Assert
    expect(toLicenseParagraphs(text)).toEqual(["MIT License", "Copyright (c) 2020 Supabase", "Permission is hereby granted, to any person obtaining a copy of this software"]);
  });

  it("줄 앞뒤 공백과 여러 빈 줄은 하나로 본다", () => {
    expect(toLicenseParagraphs("  a\n   b  \n\n\n\n  c ")).toEqual(["a b", "c"]);
  });
});
