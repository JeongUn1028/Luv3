import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SaveTrashPhotoButton } from "@/components/settings/SaveTrashPhotoButton";
import { SignedPhoto } from "@/components/SignedPhoto";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";
import { getCurrentMember } from "@/lib/auth/member";
import { SETTINGS_TRASH_PATH } from "@/lib/auth/paths";
import { catchLoadError } from "@/lib/load";
import { getTrashPhoto, TrashLoadError } from "@/lib/photos/trash-queries";
import { formatTrashDaysLeft } from "@/lib/photos/trash-view";

export const metadata: Metadata = { title: "지운 사진 · Luv3" };

// 남은 날은 사진을 읽은 뒤에야 알 수 있어 머리글도 Suspense 안에서 그린다
const TrashPhotoHeader = ({ center }: { center?: ReactNode }) => (
  <ScreenHeader back={{ href: SETTINGS_TRASH_PATH }} title="지운 사진" isTitleHidden center={center} />
);

const TrashPhoto = async ({ params }: Pick<PageProps<"/settings/trash/[id]">, "params">) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { id } = await params;
  const photo = await catchLoadError(() => getTrashPhoto(id, new Date()), TrashLoadError);

  if (photo instanceof TrashLoadError) {
    return (
      <>
        <TrashPhotoHeader />
        <LoadErrorMessage message={photo.message} />
      </>
    );
  }
  if (!photo) notFound();

  return (
    <>
      <TrashPhotoHeader
        center={<span className="text-[13px] text-ink-sub">{formatTrashDaysLeft(photo.daysLeft, "sentence")}</span>}
      />
      <div className="mt-2 flex aspect-[3/4] w-full items-center justify-center bg-surface">
        {photo.url ? (
          // 저장 버튼이 미리 받는 요청(fetch, CORS)과 같은 방식으로 받아야 브라우저가 원본을 한 번만 받는다
          <SignedPhoto src={photo.url} alt={`${photo.title}의 지운 사진`} crossOrigin="anonymous" className="size-full object-contain" />
        ) : (
          <p className="text-[13px] text-ink-sub">사진 파일을 찾을 수 없어요</p>
        )}
      </div>
      <div className="flex flex-col gap-2.5 px-4 pt-4">
        <p className="text-center text-[13px] break-words text-ink-sub">
          {photo.title}
          {photo.takenLabel && (
            <>
              <br />
              {photo.takenLabel}에 찍음
            </>
          )}
        </p>
        {/* 같은 사진을 다른 주소로 다시 그리면 새로 받도록 주소마다 새로 만든다 */}
        {photo.url && <SaveTrashPhotoButton key={photo.url} url={photo.url} fileName={photo.fileName} />}
        <p className="text-center text-[12px] leading-[1.6] text-ink-sub">기록에 다시 넣으려면 저장한 사진을 고치기에서 추가해요</p>
      </div>
    </>
  );
};

const TrashPhotoPage = ({ params }: PageProps<"/settings/trash/[id]">) => (
  <PageShell bottomSpace="sm">
    {/* 주소의 id와 세션은 요청 때만 알 수 있어 Suspense 안에서 읽는다(cacheComponents) */}
    <LoadingSuspense
      fallback={
        <>
          <TrashPhotoHeader />
          <SkeletonArea>
            <SkeletonBlock className="mt-2 aspect-[3/4] w-full" />
            <div className="px-4 pt-4">
              <SkeletonBlock className="mx-auto h-5 w-40 rounded-[4px]" />
              <SkeletonBlock className="mt-2.5 h-[52px] rounded-[10px]" />
            </div>
          </SkeletonArea>
        </>
      }
    >
      <TrashPhoto params={params} />
    </LoadingSuspense>
  </PageShell>
);

export default TrashPhotoPage;
