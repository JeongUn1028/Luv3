import { describe, expect, it, vi } from "vitest";
import type { GetSignedUrls, SigningBucket } from "@/lib/photos/signed-urls";
import { createCouplePhotoSigner } from "./photo-url";

const PATH = "couple/a.jpg";
const MEDIUM_PATH = "couple/a_medium.jpg";
const BUCKET: SigningBucket = { createSignedUrls: vi.fn() };

/** 있는 파일만 서명하는 가짜 서명 함수 */
const createFakeGetSignedUrls = (existingPaths: string[]) =>
  vi.fn<GetSignedUrls>(async (_bucket, paths) => ({
    data: paths.map((path) => ({ path, signedUrl: existingPaths.includes(path) ? `https://storage.test/${path}` : null })),
    error: null,
  }));

describe("createCouplePhotoSigner", () => {
  it("홈 카드용 중간 크기가 있으면 그 주소를 쓴다", async () => {
    const signCouplePhoto = createCouplePhotoSigner(createFakeGetSignedUrls([PATH, MEDIUM_PATH]));

    await expect(signCouplePhoto(BUCKET, PATH)).resolves.toEqual({ signedUrl: `https://storage.test/${MEDIUM_PATH}` });
  });

  // 중간 크기를 만들기 전(#218)에 올린 사진은 원본만 있다
  it("중간 크기가 없으면 원본 주소를 쓰고, 다음부터는 중간 크기를 서명하지 않는다", async () => {
    // Arrange
    const getSignedUrls = createFakeGetSignedUrls([PATH]);
    const signCouplePhoto = createCouplePhotoSigner(getSignedUrls);

    // Act
    const results = [await signCouplePhoto(BUCKET, PATH), await signCouplePhoto(BUCKET, PATH)];

    // Assert
    expect(results).toEqual([{ signedUrl: `https://storage.test/${PATH}` }, { signedUrl: `https://storage.test/${PATH}` }]);
    expect(getSignedUrls.mock.calls.map(([, paths]) => paths)).toEqual([[MEDIUM_PATH, PATH], [PATH]]);
  });

  it("둘 다 없으면 주소가 없고, 다음에도 둘 다 서명해 본다", async () => {
    // Arrange
    const getSignedUrls = createFakeGetSignedUrls([]);
    const signCouplePhoto = createCouplePhotoSigner(getSignedUrls);

    // Act
    const results = [await signCouplePhoto(BUCKET, PATH), await signCouplePhoto(BUCKET, PATH)];

    // Assert
    expect(results).toEqual([{ signedUrl: undefined }, { signedUrl: undefined }]);
    expect(getSignedUrls.mock.calls.map(([, paths]) => paths)).toEqual([[MEDIUM_PATH, PATH], [MEDIUM_PATH, PATH]]);
  });

  it("서명 요청이 실패하면 오류를 돌려준다", async () => {
    const error = new Error("network");
    const signCouplePhoto = createCouplePhotoSigner(vi.fn<GetSignedUrls>(async () => ({ data: null, error })));

    await expect(signCouplePhoto(BUCKET, PATH)).resolves.toEqual({ error });
  });
});
