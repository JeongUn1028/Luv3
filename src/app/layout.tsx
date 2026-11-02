import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  <html lang="ko" className="h-full antialiased">
    <body className="min-h-full bg-background text-ink">{children}</body>
  </html>
);

export default RootLayout;
