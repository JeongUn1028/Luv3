"use client";

import type { ReactElement } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

interface ErrorPageProps {
  /** 화면을 다시 불러와 그린다 */
  retry: () => void;
}

/** 각 화면이 문구로 처리하지 않은 오류를 받는다. 로그인 이동과 찾을 수 없음은 Next가 먼저 처리해 여기로 오지 않는다 */
const ErrorPage = ({ retry }: ErrorPageProps): ReactElement => <ErrorScreen onRetry={retry} />;

export default ErrorPage;
