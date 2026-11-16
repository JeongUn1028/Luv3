import { flushSync } from "react-dom";
import { FIX_FIELDS_NOTICE } from "@/lib/form";

/** 오류 칸 표시. 입력 칸은 `aria-invalid`, aria-invalid를 쓸 수 없는 버튼(날짜 고르기·사진 고르기)은 `data-invalid`로 표시한다 */
export const INVALID_FIELD_SELECTOR = '[aria-invalid="true"], [data-invalid="true"]';

/**
 * 폼에서 화면 순서로 첫 오류 칸에 초점을 주고 가운데로 스크롤한다. 저장 버튼은 폼 맨 아래라, 위쪽 칸이 틀리면 안내만 보이고 어느 칸인지 찾아 올라가야 한다.
 * 오류 상태를 화면에 그린 뒤에 불러야 한다(`flushSync`). 화면 순서로 찾는 것과 버튼의 data-invalid는 화면 테스트(`form-error-guidance.spec.ts`)가 확인한다.
 * 머리글에 가리지 않게 초점이 주는 스크롤 대신 가운데로 옮긴다.
 *
 * @example
 * flushSync(() => setErrors(nextErrors));
 * focusFirstInvalidField(form);
 */
export const focusFirstInvalidField = (form: HTMLFormElement): void => {
  const field = form.querySelector<HTMLElement>(INVALID_FIELD_SELECTOR);
  if (!field) return;
  field.focus({ preventScroll: true });
  field.scrollIntoView({ block: "center" });
};

interface ShowInvalidFieldsParams<Errors> {
  form: HTMLFormElement;
  /** 입력 검사 결과. 칸 이름 → 에러 문구 */
  errors: Errors;
  setErrors: (errors: Errors) => void;
  setNotice: (notice: string) => void;
}

/**
 * 저장할 때 입력 검사 결과를 그린다. 오류가 있으면 칸 오류와 폼 안내("입력한 내용을 확인해 주세요.")를 바로 그리고 첫 오류 칸으로 초점을 옮긴다(#388).
 * 기록·일정·할 일·닉네임 폼이 같은 순서로 알리게 한다.
 *
 * @returns 오류가 있어 저장을 멈춰야 하면 true
 * @example if (showInvalidFields({ form: event.currentTarget, errors: validateEventDraft(draft), setErrors, setNotice })) return;
 */
export const showInvalidFields = <Errors extends Partial<Record<string, string>>>({ form, errors, setErrors, setNotice }: ShowInvalidFieldsParams<Errors>): boolean => {
  if (Object.keys(errors).length === 0) {
    setErrors(errors);
    return false;
  }
  // 오류 칸이 그려져야 찾을 수 있어 바로 그린다
  flushSync(() => {
    setErrors(errors);
    setNotice(FIX_FIELDS_NOTICE);
  });
  focusFirstInvalidField(form);
  return true;
};
