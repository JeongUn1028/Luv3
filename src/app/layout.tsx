import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Noto_Sans_KR } from "next/font/google";
import { OfflineNotice } from "@/components/OfflineNotice";
import { SaveNotices } from "@/components/SaveNotices";
import { SessionLostDialog } from "@/components/SessionLostDialog";
import "./globals.css";

// next/font에 한글 subset이 없어 미리 불러오지 않는다. 브라우저가 필요한 글자 범위만 받는다.
const notoSansKr = Noto_Sans_KR({
  weight: "variable",
  variable: "--font-noto-sans-kr",
  preload: false,
});

// 영문·숫자 표기(SINCE, DAYS, 연·월)용
const cormorantGaramond = Cormorant_Garamond({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-cormorant",
});

// globals.css의 --color-background와 같은 값. CSS 파일을 받기 전에 쓰는 곳이라 CSS 변수를 쓸 수 없다
const APP_BACKGROUND_COLOR = "#0A0A0A";

export const metadata: Metadata = {
  title: "Luv3",
  description: "둘이서만 보는 데이트 앨범",
  robots: { index: false, follow: false },
  // 아이폰 홈 화면에 추가하면 주소창 없이 열고, 상태바는 배경 위에 겹쳐 그린다(각 화면이 상태바와 맨 위 빈 자리만큼 띄운다, globals.css의 --top-blank)
  appleWebApp: {
    capable: true,
    title: "Luv3",
    statusBarStyle: "black-translucent",
    // 아이폰은 manifest의 배경색으로 시작 화면을 만들지 않아, 이미지가 없으면 켤 때 하얀 화면이 나온다(#119).
    // 기기 화면과 크기가 정확히 맞아야 쓰이므로 대상 기기마다 하나씩 둔다. 세로로만 쓰는 앱이라 세로 이미지만 둔다.
    // 이미 홈 화면에 추가한 앱은 지우고 다시 추가해야 바뀔 수 있다.
    // 이미지는 로그인 화면의 로고를 찍은 것이라 ANNIVERSARY_DATE나 로고를 바꾸면 다시 그린다
    startupImage: [
      {
        url: "/startup/iphone-15-pro.png",
        media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/startup/iphone-17.png",
        media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
    ],
  },
  // Next.js가 appleWebApp.capable로 mobile-web-app-capable만 만들어, 시작 이미지에 필요하다고 보고된 예전 태그를 함께 넣는다
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: APP_BACKGROUND_COLOR,
  colorScheme: "dark",
  // 노치·홈 인디케이터 영역까지 화면을 채운다. 이 설정이 있어야 env(safe-area-inset-*) 값이 0이 아니게 된다
  viewportFit: "cover",
};

const RootLayout = ({ children }: LayoutProps<"/">) => (
  // 시작 이미지가 사라진 뒤 CSS가 오기 전에도 흰 화면이 보이지 않게 배경색을 HTML에 직접 넣는다(#121)
  <html
    lang="ko"
    className={`${notoSansKr.variable} ${cormorantGaramond.variable} h-full antialiased`}
    style={{ backgroundColor: APP_BACKGROUND_COLOR }}
  >
    <body className="min-h-full bg-background font-sans text-ink">
      {/* 화면 높이 틀. 화면(PageShell)이 이 안을 채운다 */}
      <div className="mx-auto flex h-app w-full max-w-[430px] flex-col">
        <OfflineNotice />
        {children}
      </div>
      <SaveNotices />
      <SessionLostDialog />
    </body>
  </html>
);

export default RootLayout;
