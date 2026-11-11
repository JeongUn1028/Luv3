import type { ReactElement, ReactNode } from "react";
import { CloseIcon } from "@/components/icons";

interface MapSheetProps {
  /** 칸 전체의 이름(스크린 리더) */
  label: string;
  title: string;
  /** 제목 옆의 작은 글(사진 수 등) */
  subtitle?: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/** 지도 아래에서 올라오는 칸. 핀을 눌렀을 때 그 자리의 기록·사진을 보여 준다 */
export const MapSheet = ({ label, title, subtitle, closeLabel, onClose, children }: MapSheetProps): ReactElement => (
  // 바깥 칸은 올라올 수 있는 높이만 정한다. 비어 있는 자리의 지도는 그대로 움직일 수 있다
  <div className="pointer-events-none absolute inset-x-0 top-[40%] bottom-0 z-10 flex flex-col justify-end">
    <section aria-label={label} className="pointer-events-auto relative max-h-full overflow-y-auto rounded-t-[14px] border-t border-line bg-surface">
      <div className="flex items-center justify-between pl-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="min-w-0 truncate text-[15px] text-ink">{title}</h2>
          {subtitle && <span className="shrink-0 text-[12px] text-ink-sub">{subtitle}</span>}
        </div>
        <button type="button" aria-label={closeLabel} onClick={onClose} className="press-icon flex size-11 shrink-0 items-center justify-center text-ink-sub">
          <CloseIcon className="size-5" />
        </button>
      </div>
      {children}
    </section>
  </div>
);
