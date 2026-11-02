import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Noto_Sans_KR } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Luv3",
  description: "둘이서만 보는 데이트 앨범",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark",
};

const RootLayout = ({ children }: LayoutProps<"/">) => (
  <html lang="ko" className={`${notoSansKr.variable} ${cormorantGaramond.variable} h-full antialiased`}>
    <body className="min-h-full bg-background font-sans text-ink">{children}</body>
  </html>
);

export default RootLayout;
