import { describe, expect, it, vi } from "vitest";
import { createMediumPhotoSigner } from "./medium-signer";
import type { GetSignedUrls, SigningBucket } from "./signed-urls";

const BUCKET: SigningBucket = { createSignedUrls: vi.fn() };
const EXPIRES_AT = 1_000_000;
const NEW_PATH = "d/new.jpg";
const NEW_MEDIUM_PATH = "d/new_medium.jpg";
const OLD_PATH = "d/old.jpg";
const OLD_MEDIUM_PATH = "d/old_medium.jpg";
const THUMB_PATH = "d/old_thumb.jpg";

/** 있는 파일만 서명하는 가짜 서명 함수 */
const createFakeGetSignedUrls = (existingPaths: string[]) =>
  vi.fn<GetSignedUrls>(async (_bucket, paths) => ({
    data: paths.map((path) =>
      existingPaths.includes(path) ? { path, signedUrl: `https://storage.test/${path}`, expiresAt: EXPIRES_AT } : { path, signedUrl: null, expiresAt: undefined },
    ),
    error: null,
  }));

const requestedPaths = (getSignedUrls: ReturnType<typeof createFakeGetSignedUrls>) => getSignedUrls.mock.calls.map(([, paths]) => paths);

describe("createMediumPhotoSigner", () => {
  it("원본마다 옆의 중간 크기와 함께 넘긴 다른 경로까지 한 번에 서명한다", async () => {
    // Arrange
    const getSignedUrls = createFakeGetSignedUrls([NEW_PATH, NEW_MEDIUM_PATH, THUMB_PATH]);
    const sign = createMediumPhotoSigner(getSignedUrls);

    // Act
    const result = await sign(BUCKET, { originalPaths: [NEW_PATH], otherPaths: [THUMB_PATH] });

    // Assert
    expect(requestedPaths(getSignedUrls)).toEqual([[NEW_MEDIUM_PATH, NEW_PATH, THUMB_PATH]]);
    expect(result.data?.map(({ path, signedUrl }) => [path, signedUrl])).toEqual([
      [NEW_MEDIUM_PATH, `https://storage.test/${NEW_MEDIUM_PATH}`],
      [NEW_PATH, `https://storage.test/${NEW_PATH}`],
      [THUMB_PATH, `https://storage.test/${THUMB_PATH}`],
    ]);
  });

  // 중간 크기를 만들기 전에 올린 사진은 원본만 있고, 중간 크기는 원본보다 먼저 올려 나중에 생기지 않는다
  it("원본은 있는데 중간 크기가 없던 사진은 다음부터 중간 크기를 서명하지 않는다", async () => {
    // Arrange
    const getSignedUrls = createFakeGetSignedUrls([NEW_PATH, NEW_MEDIUM_PATH, OLD_PATH]);
    const sign = createMediumPhotoSigner(getSignedUrls);

    // Act
    await sign(BUCKET, { originalPaths: [NEW_PATH, OLD_PATH] });
    await sign(BUCKET, { originalPaths: [NEW_PATH, OLD_PATH] });

    // Assert
    expect(requestedPaths(getSignedUrls)).toEqual([
      [NEW_MEDIUM_PATH, OLD_MEDIUM_PATH, NEW_PATH, OLD_PATH],
      [NEW_MEDIUM_PATH, NEW_PATH, OLD_PATH],
    ]);
  });

  // 원본도 없으면 파일이 지워졌거나 서명이 잠깐 실패한 경우라 중간 크기가 없다고 단정하지 않는다
  it("원본도 서명하지 못했으면 다음에도 중간 크기를 서명해 본다", async () => {
    const getSignedUrls = createFakeGetSignedUrls([]);
    const sign = createMediumPhotoSigner(getSignedUrls);

    await sign(BUCKET, { originalPaths: [OLD_PATH] });
    await sign(BUCKET, { originalPaths: [OLD_PATH] });

    expect(requestedPaths(getSignedUrls)).toEqual([
      [OLD_MEDIUM_PATH, OLD_PATH],
      [OLD_MEDIUM_PATH, OLD_PATH],
    ]);
  });

  it(".jpg로 끝나지 않는 원본은 중간 크기 없이 원본만 서명한다", async () => {
    const getSignedUrls = createFakeGetSignedUrls(["d/odd.JPG"]);
    const sign = createMediumPhotoSigner(getSignedUrls);

    await sign(BUCKET, { originalPaths: ["d/odd.JPG"] });

    expect(requestedPaths(getSignedUrls)).toEqual([["d/odd.JPG"]]);
  });

  it("서명 요청이 실패하면 오류를 그대로 돌려주고 아무것도 기억하지 않는다", async () => {
    // Arrange
    const error = new Error("network");
    const getSignedUrls = vi.fn<GetSignedUrls>().mockResolvedValueOnce({ data: null, error });
    const sign = createMediumPhotoSigner(getSignedUrls);

    // Act
    const result = await sign(BUCKET, { originalPaths: [OLD_PATH] });
    getSignedUrls.mockImplementation(createFakeGetSignedUrls([OLD_PATH]));
    await sign(BUCKET, { originalPaths: [OLD_PATH] });

    // Assert
    expect(result).toEqual({ data: null, error });
    expect(getSignedUrls.mock.calls.map(([, paths]) => paths)).toEqual([
      [OLD_MEDIUM_PATH, OLD_PATH],
      [OLD_MEDIUM_PATH, OLD_PATH],
    ]);
  });
});
