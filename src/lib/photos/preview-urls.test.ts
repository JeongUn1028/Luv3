import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewUrls } from "./preview-urls";

const toFile = (name: string): File => new File(["사진"], name, { type: "image/jpeg" });

describe("createPreviewUrls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("파일로 만든 미리보기를 해제하면 브라우저에 돌려준다", () => {
    // Arrange
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const previews = createPreviewUrls();
    const url = previews.create(toFile("a.jpg"));

    // Act
    previews.revoke(url);

    // Assert
    expect(revoke).toHaveBeenCalledExactlyOnceWith(url);
  });

  it("만든 적 없는 주소(저장된 사진의 서명 주소)는 해제하지 않는다", () => {
    // Arrange
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const previews = createPreviewUrls();

    // Act
    previews.revoke("https://example.supabase.co/storage/v1/object/sign/album/a.jpg");
    previews.revoke(undefined);

    // Assert
    expect(revoke).not.toHaveBeenCalled();
  });

  it("같은 미리보기를 두 번 해제해도 한 번만 돌려준다", () => {
    // Arrange
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const previews = createPreviewUrls();
    const url = previews.create(toFile("a.jpg"));

    // Act
    previews.revoke(url);
    previews.revoke(url);

    // Assert
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("모두 해제하면 아직 해제하지 않은 미리보기만 돌려준다", () => {
    // Arrange
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const previews = createPreviewUrls();
    const firstUrl = previews.create(toFile("first.jpg"));
    const removedUrl = previews.create(toFile("removed.jpg"));
    previews.revoke(removedUrl);
    const lastUrl = previews.create(toFile("last.jpg"));
    revoke.mockClear();

    // Act
    previews.revokeAll();

    // Assert
    expect(revoke.mock.calls.flat().sort()).toEqual([firstUrl, lastUrl].sort());
  });
});
