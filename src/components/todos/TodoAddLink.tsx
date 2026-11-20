"use client";

import Link from "next/link";
import { useSyncExternalStore, type MouseEvent, type ReactElement } from "react";
import { PlusIcon } from "@/components/icons";
import { SCREEN_HEADER_ICON_CLASS_NAME } from "@/components/ScreenHeader";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { TODOS_PATH } from "@/lib/todos/list";
import { todoReorderMode } from "@/lib/todos/reorder-mode";

const preventOpening = (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault();

/**
 * 하고 싶은 것 탭 머리글의 + 버튼. 순서 바꾸기 편집 중에는 막는다(#497).
 * 눌렀을 때 초점을 잃지 않게 disabled 대신 aria-disabled로 두고 이동만 막는다.
 *
 * @example <TabScreen actions={<TodoAddLink />} />
 */
export const TodoAddLink = (): ReactElement => {
  // 서버에서 그린 화면은 편집 중일 수 없다
  const isReordering = useSyncExternalStore(todoReorderMode.subscribe, todoReorderMode.get, () => false);
  return (
    <Link
      href={`${TODOS_PATH}/new`}
      transitionTypes={FORWARD_TRANSITION}
      aria-label="하고 싶은 것 추가"
      aria-disabled={isReordering}
      onClick={isReordering ? preventOpening : undefined}
      className={`${SCREEN_HEADER_ICON_CLASS_NAME} aria-disabled:opacity-30 aria-disabled:hover:text-ink-sub`}
    >
      <PlusIcon className="size-6" />
    </Link>
  );
};
