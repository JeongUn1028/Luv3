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
