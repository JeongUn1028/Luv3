import type { ReactElement, ReactNode } from "react";

interface FormFooterProps {
  /** 폼 아래 안내(칸 오류, 저장 실패). 없으면 그리지 않는다 */
  notice: string | undefined;
  /** 저장 버튼이나, 다시 저장해도 실패할 때 대신 줄 버튼 */
  children: ReactNode;
}

/**
 * 폼 맨 아래 줄: 안내 문구와 저장 버튼. 기록·일정·할 일·닉네임·비밀번호 폼이 같은 자리·모양으로 알린다(#388).
 *
 * @example
 * <FormFooter notice={notice}>
 *   <SaveButton isDisabled={isSaving}>{isSaving ? "저장 중…" : "저장"}</SaveButton>
 * </FormFooter>
 */
export const FormFooter = ({ notice, children }: FormFooterProps): ReactElement => (
  <div className="flex flex-col">
    {notice && (
      <p role="alert" className="mb-3 text-[13px] text-accent">
        {notice}
      </p>
    )}
    {children}
  </div>
);
