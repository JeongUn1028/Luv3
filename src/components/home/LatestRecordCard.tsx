import Link from "next/link";
import type { ReactElement } from "react";
import type { AlbumTile } from "@/lib/dates/album";
import { formatRecordDate } from "@/lib/dates/detail";

interface LatestRecordCardProps {
  record: AlbumTile;
}

/** 홈의 최근 데이트 카드: 대표 사진 썸네일 + 제목 + 날짜·장소. 누르면 기록 상세로 간다 */
export const LatestRecordCard = ({ record }: LatestRecordCardProps): ReactElement => (
  <Link href={`/dates/${record.id}`} className="flex items-center gap-3 rounded-[12px] bg-surface p-2.5 pr-4">
    <span className="size-16 shrink-0 overflow-hidden rounded-[8px] bg-line">
      {record.thumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- 업로드 때 이미 600px로 줄인 썸네일이라 next/image 최적화를 다시 거치지 않는다
        <img src={record.thumbUrl} alt="" className="size-full object-cover" />
      )}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-[15px] text-ink">{record.title}</span>
      <span className="truncate text-[12px] text-ink-sub">
        {formatRecordDate(record.date)}
        {record.place && ` · ${record.place}`}
      </span>
    </span>
  </Link>
);
