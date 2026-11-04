import type { ReactElement } from "react";
import { StatusLink, StatusScreen } from "@/components/StatusScreen";
import { RECORDS_PATH } from "@/lib/dates/album";

/** 없는 기록(지워졌거나 잘못된 주소)을 열었을 때 */
const DateRecordNotFound = (): ReactElement => (
  <StatusScreen title="기록을 찾을 수 없어요" description="지워졌거나 주소가 잘못됐어요.">
    <StatusLink href={RECORDS_PATH}>기록 목록으로</StatusLink>
  </StatusScreen>
);

export default DateRecordNotFound;
