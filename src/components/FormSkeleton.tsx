import type { ReactElement } from "react";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";

interface FormSkeletonProps {
  /** 뒤로 가기 링크. 고치기 화면은 아직 주소의 id를 모르므로 위 목록으로 잇는다 */
  back: { href: string };
  title: string;
  /** 입력 칸 개수 */
  fieldCount: number;
}

/**
 * 작성·고치기 화면을 불러오는 동안의 뼈대. 머리글은 실제 화면과 같고 입력 칸 자리만 잡는다.
 *
 * @example <FormSkeleton back={{ href: TODOS_PATH }} title="하고 싶은 것 추가" fieldCount={1} />
 */
export const FormSkeleton = ({ back, title, fieldCount }: FormSkeletonProps): ReactElement => (
  <PageShell bottomSpace="sm" className="px-4" header={<ScreenHeader back={back} title={title} />}>
    <SkeletonArea>
      <div className="mt-3 flex flex-col gap-4">
        {Array.from({ length: fieldCount }, (_, index) => (
          <div key={index}>
            <SkeletonBlock className="h-4 w-14 rounded-[4px]" />
            <SkeletonBlock className="mt-2 h-[51px] rounded-[10px]" />
          </div>
        ))}
      </div>
    </SkeletonArea>
  </PageShell>
);
