import type { MetadataRoute } from "next";

/** 홈 화면 웹앱 정보. 아이폰은 아이콘을 `apple-icon.png`에서 가져가고, 안드로이드·데스크톱 Chrome이 이 아이콘을 쓴다 */
const manifest = (): MetadataRoute.Manifest => ({
  // 설치된 앱을 구별하는 값. 나중에 start_url을 바꿔도 같은 앱으로 남게 고정한다
  id: "/",
  name: "Luv3",
  short_name: "Luv3",
  description: "둘이서만 보는 데이트 앨범",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  lang: "ko",
  theme_color: "#0A0A0A",
  background_color: "#0A0A0A",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    // 하트와 글자가 가운데 80% 안에 있어 원·물방울 모양으로 잘려도 그대로 보인다
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
});

export default manifest;
