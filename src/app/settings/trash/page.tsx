import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SignedPhoto } from "@/components/SignedPhoto";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";
import { getCurrentMember } from "@/lib/auth/member";
import { SETTINGS_PATH } from "@/lib/auth/paths";
import { catchLoadError } from "@/lib/load";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { TRASH_RETENTION_DAYS } from "@/lib/photos/trash";
import { getTrashSections, TrashLoadError } from "@/lib/photos/trash-queries";
import { formatTrashDaysLeft, toTrashPhotoHref, type TrashSection } from "@/lib/photos/trash-view";

export const metadata: Metadata = { title: "휴지통 · Luv3" };

const TrashSectionGrid = ({ section }: { section: TrashSection }): ReactElement => (
  <section aria-labelledby={`trash-${section.key}`} className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={`trash-${section.key}`} className="min-w-0 truncate text-[15px] text-ink">
        {section.title}
      </h2>
      <span className="shrink-0 text-[12px] text-ink-sub">{section.deletedLabel}</span>
    </div>
    {/* 기록 그리드와 같이 모서리 8px·간격 6px(#321) */}
    <ul className="grid grid-cols-3 gap-1.5">
      {section.photos.map((photo, index) => (
        <li key={photo.id}>
          <Link
            href={toTrashPhotoHref(photo.id)}
            transitionTypes={FORWARD_TRANSITION}
            aria-label={`사진 ${index + 1}, ${formatTrashDaysLeft(photo.daysLeft, "label")}`}
            className="press-card relative block aspect-square rounded-[8px] bg-surface"
          >
            {photo.thumbUrl && <SignedPhoto src={photo.thumbUrl} alt="" loading="lazy" className="absolute inset-0 size-full rounded-[8px] object-cover" />}
            <span aria-hidden="true" className="absolute bottom-1 left-1 rounded-[4px] bg-background/60 px-[5px] py-0.5 text-[11px] text-ink">
              {formatTrashDaysLeft(photo.daysLeft, "badge")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  </section>
);

const TrashList = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const sections = await catchLoadError(() => getTrashSections(new Date()), TrashLoadError);
  if (sections instanceof TrashLoadError) return <LoadErrorMessage message={sections.message} />;
  if (sections.length === 0) {
    return <p className="py-12 text-center text-[15px] text-ink">휴지통이 비어 있어요</p>;
  }
  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <TrashSectionGrid key={section.key} section={section} />
      ))}
    </div>
  );
};

const TrashPage = () => (
  <PageShell bottomSpace="sm" className="px-4" header={<ScreenHeader back={{ href: SETTINGS_PATH }} title="휴지통" />}>
    <p className="mt-2 mb-5 text-[13px] leading-[1.6] text-ink-sub">
      지운 사진은 {TRASH_RETENTION_DAYS}일 동안 여기 남아요. 그 뒤 매달 1일 정리 때 완전히 지워져요. 사진을 눌러 휴대폰에 저장할 수 있어요.
    </p>
    {/* 세션을 읽는 부분만 요청 시점에 렌더링한다(cacheComponents) */}
    <LoadingSuspense
      fallback={
        <SkeletonArea>
          <SkeletonBlock className="h-5 w-40 rounded-[4px]" />
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <SkeletonBlock className="aspect-square rounded-[8px]" />
            <SkeletonBlock className="aspect-square rounded-[8px]" />
            <SkeletonBlock className="aspect-square rounded-[8px]" />
          </div>
        </SkeletonArea>
      }
    >
      <TrashList />
    </LoadingSuspense>
  </PageShell>
);

export default TrashPage;
