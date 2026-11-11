import Link from "next/link";
import type { ReactElement } from "react";
import { formatRecordPeriod, toRecordHref } from "@/lib/dates/detail";
import type { MapPin } from "@/lib/dates/map";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { MapSheet } from "./MapSheet";

interface MapRecordListProps {
  /** 기록이 여러 개인 기록 장소 핀 */
  pin: MapPin;
  onClose: () => void;
}

/** 사진 위치가 없는 기록의 장소 핀을 눌렀을 때 아래에 띄우는 기록 목록 */
export const MapRecordList = ({ pin, onClose }: MapRecordListProps): ReactElement => (
  <MapSheet label={`${pin.place} 기록`} title={pin.place} closeLabel="목록 닫기" onClose={onClose}>
    <ul>
      {pin.records.map(({ id, title, date, endDate, place }) => (
        <li key={id} className="border-t border-line">
          <Link href={toRecordHref(id)} transitionTypes={FORWARD_TRANSITION} className="press-card flex min-h-11 flex-col justify-center px-4 py-2">
            <span className="text-[15px] break-words text-ink">{title}</span>
            <span className="text-[12px] break-words text-ink-sub">
              {formatRecordPeriod({ date, endDate })}
              {place !== pin.place && ` · ${place}`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  </MapSheet>
);
