import type { ReactElement } from "react";
import { StatusLink, StatusScreen } from "@/components/StatusScreen";
import { SETTINGS_TRASH_PATH } from "@/lib/auth/paths";

/** 없는 휴지통 사진(보관 기간이 지나 정리됐거나 잘못된 주소)을 열었을 때 */
const TrashPhotoNotFound = (): ReactElement => (
  <StatusScreen title="사진을 찾을 수 없어요" description="보관 기간이 지나 완전히 지워졌거나 주소가 잘못됐어요.">
    <StatusLink href={SETTINGS_TRASH_PATH}>휴지통으로</StatusLink>
  </StatusScreen>
);

export default TrashPhotoNotFound;
