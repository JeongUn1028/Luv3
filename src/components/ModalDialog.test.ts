import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

const MODAL_DIALOG_FILE = "components/ModalDialog.tsx";

// 실제 동작은 e2e/modal-dialog.spec.ts와 e2e/delete-dialog.spec.ts가 잰다. Vitest(node)로는 창을 열 수 없어 규칙만 고정한다

/** 공통 모달 밖에서 이 글자가 나오는 곳 */
const findOutsideModalDialog = (pattern: RegExp): string[] =>
  readSourceLines().flatMap(({ at, lines }) =>
    at === MODAL_DIALOG_FILE ? [] : lines.flatMap((line, index) => (pattern.test(line) ? [`${at}:${index + 1}`] : [])),
  );

describe("공통 모달", () => {
  it("창은 공통 모달에서만 만든다", () => {
    expect(findOutsideModalDialog(/<dialog\b/)).toEqual([]);
  });

  it("창은 공통 모달에서만 연다", () => {
    expect(findOutsideModalDialog(/\.showModal\(/)).toEqual([]);
  });

  it("화면이 숨겨질 때 닫는 처리는 공통 모달이 맡아 창마다 부르지 않는다", () => {
    // 빠뜨리면 숨겨진 화면의 창이 앱 전체를 막는다(#155)
    expect(readSource(MODAL_DIALOG_FILE)).toContain("useCloseDialogOnHide(dialogRef)");
    expect(findOutsideModalDialog(/\buseCloseDialogOnHide\(/)).toEqual([]);
  });
});
