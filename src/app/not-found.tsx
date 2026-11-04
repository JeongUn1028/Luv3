import type { Metadata } from "next";
import type { ReactElement } from "react";
import { StatusLink, StatusScreen } from "@/components/StatusScreen";
import { HOME_PATH } from "@/lib/auth/paths";

export const metadata: Metadata = { title: "찾을 수 없음 · Luv3" };

/** 없는 주소로 들어왔을 때 */
const NotFoundPage = (): ReactElement => (
  <StatusScreen title="화면을 찾을 수 없어요" description="없어졌거나 주소가 잘못됐어요.">
    <StatusLink href={HOME_PATH}>홈으로</StatusLink>
  </StatusScreen>
);

export default NotFoundPage;
