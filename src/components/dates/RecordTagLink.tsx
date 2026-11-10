"use client";

import Link from "next/link";
import type { MouseEvent, ReactElement } from "react";
import { FILLED_TAG_CHIP_CLASS_NAME } from "@/components/dates/tagChip";
import { recordTagLinkCount, toRecordSearchHref } from "@/lib/dates/search";
import { forgetScrollPosition } from "@/lib/navigation/scroll-memory";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

interface RecordTagLinkProps {
  tag: string;
}

/**
 * 기록 상세의 태그. 누르면 기록 탭에서 그 태그의 기록을 모아 본다.
 * 다른 목록을 새로 보는 것이므로 기록 탭에서 내려가 있던 위치와 쓰던 검색어를 되살리지 않는다.
 *
 * @example <RecordTagLink tag="카페" />
 */
export const RecordTagLink = ({ tag }: RecordTagLinkProps): ReactElement => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // 새 탭·새 창으로 열면 이 화면은 그대로이므로 위치와 검색어를 남긴다
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    forgetScrollPosition("records");
    recordTagLinkCount.set(recordTagLinkCount.get() + 1);
  };

  return (
    <Link href={toRecordSearchHref(tag)} transitionTypes={FORWARD_TRANSITION} onClick={handleClick} className={FILLED_TAG_CHIP_CLASS_NAME}>
      {tag}
    </Link>
  );
};
