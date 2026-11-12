import Link from "next/link";
import type { ReactElement } from "react";
import { SignedPhoto } from "@/components/SignedPhoto";
import { formatPeriodMonthDay, groupByMonth, type AlbumTile } from "@/lib/dates/album";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

interface AlbumGridProps {
  tiles: AlbumTile[];
}

/** 달마다 묶은 2열 대표 사진 그리드(home.svg). 칸을 누르면 기록 상세로 간다 */
export const AlbumGrid = ({ tiles }: AlbumGridProps): ReactElement => {
  if (tiles.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-[15px] text-ink">아직 남긴 기록이 없어요</p>
        <p className="text-[13px] text-ink-sub">오른쪽 위 + 버튼으로 첫 데이트를 남겨 보세요</p>
      </div>
    );
  }

  return (
    <div className="mt-[11px] flex flex-col gap-6 pb-6">
      {groupByMonth(tiles).map(({ key, label, tiles: monthTiles }) => (
        <section key={key} aria-labelledby={`month-${key}`}>
          <h2 id={`month-${key}`} className="px-0.5 font-display text-[15px] tracking-[3px] text-label">
            {label}
          </h2>
          {/* 간격이 4px이면 둥근 모서리가 거의 보이지 않아 6px로 둔다(#321) */}
          <ul className="mt-2 grid grid-cols-2 gap-1.5">
            {monthTiles.map((tile) => (
              <li key={tile.id}>
                <Link
                  href={`/dates/${tile.id}`}
                  transitionTypes={FORWARD_TRANSITION}
                  className="press-card relative block aspect-[4/5] rounded-[8px] bg-surface"
                >
                  {/* 누르는 동안 넓히는 영역이 잘리지 않게 링크에 overflow-hidden을 쓰지 않고, 홈 최근 데이트 칸처럼 사진과 그림자에 직접 모서리를 준다 */}
                  {tile.thumbUrl && (
                    <SignedPhoto src={tile.thumbUrl} alt={tile.title} loading="lazy" className="absolute inset-0 size-full rounded-[8px] object-cover" />
                  )}
                  {/* 밝은 사진 위에서도 글자가 읽히도록 아래쪽만 어둡게 깐다 */}
                  <span className="absolute inset-x-0 bottom-0 truncate rounded-b-[8px] bg-gradient-to-t from-background/80 to-transparent px-2.5 pt-6 pb-2.5 text-[12px] text-ink">
                    {!tile.thumbUrl && <span className="sr-only">{tile.title}, </span>}
                    {formatPeriodMonthDay(tile)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
