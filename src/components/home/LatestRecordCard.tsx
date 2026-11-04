import Link from "next/link";
import { useId, type ReactElement } from "react";
import type { AlbumTile } from "@/lib/dates/album";
import { formatRecordShortDate } from "@/lib/dates/detail";

interface LatestRecordCardProps {
  record: AlbumTile;
}

/** 홈의 최근 데이트 정사각형 칸: 대표 사진을 가득 깔고 아래에 제목과 날짜·장소를 쓴다. 누르면 기록 상세로 간다 */
export const LatestRecordCard = ({ record }: LatestRecordCardProps): ReactElement => {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="relative aspect-square overflow-hidden rounded-[16px] bg-surface">
      {/* 링크 위에 떠 있지만 눌러도 칸을 누른 것으로 친다 */}
      <h2
        id={titleId}
        className="pointer-events-none absolute top-2.5 left-2.5 z-10 rounded-full bg-background/70 px-[9px] py-[3px] text-[11px] leading-4 text-ink"
      >
        최근 데이트
      </h2>
      <Link href={`/dates/${record.id}`} className="absolute inset-0 rounded-[16px] -outline-offset-2">
        {record.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- 업로드 때 이미 600px로 줄인 썸네일이라 next/image 최적화를 다시 거치지 않는다
          <img src={record.thumbUrl} alt="" className="size-full object-cover" />
        )}
        {/* 흰 사진 위에서도 두 줄 제목 윗줄까지 글자가 읽히도록(명암비 4.5:1) 글자 높이까지 진하게 깐다 */}
        <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-background/90 via-background/70 via-60% to-transparent px-3 pt-9 pb-3">
          <span className="line-clamp-2 text-[15px] leading-5 font-bold text-ink">{record.title}</span>
          <span className="truncate text-[12px] leading-4 text-ink/80">
            {formatRecordShortDate(record)}
            {record.place && ` · ${record.place}`}
          </span>
        </span>
      </Link>
    </section>
  );
};
