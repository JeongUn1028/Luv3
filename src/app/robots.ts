import type { MetadataRoute } from "next";

/** 비공개 앨범이므로 모든 검색 엔진의 수집을 막는다. */
const robots = (): MetadataRoute.Robots => ({
  rules: { userAgent: "*", disallow: "/" },
});

export default robots;
