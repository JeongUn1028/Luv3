import type { ReactElement } from "react";
import type { KakaoMapStatus } from "./use-kakao-map";

interface MapLoadStatusProps {
  status: KakaoMapStatus;
  onRetry: () => void;
}

/**
 * 지도를 불러오는 중이거나 실패했을 때 지도 자리 위에 띄우는 안내. 불러왔으면 아무것도 그리지 않는다.
 * 부모가 `relative`여야 지도 자리를 덮는다.
 *
 * @example <MapLoadStatus status={status} onRetry={retry} />
 */
export const MapLoadStatus = ({ status, onRetry }: MapLoadStatusProps): ReactElement | null => {
  if (status === "loading") {
    return (
      <p role="status" className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-sub">
        지도를 불러오는 중…
      </p>
    );
  }
  if (status === "failed") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <p role="alert" className="text-[13px] text-ink-sub">
          지도를 불러오지 못했어요.
        </p>
        <button type="button" onClick={onRetry} className="press-icon min-h-11 px-4 text-[13px] text-ink underline">
          다시 시도
        </button>
      </div>
    );
  }
  return null;
};
