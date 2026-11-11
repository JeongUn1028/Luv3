// 테스트용으로 사진 정보(EXIF)가 든 JPEG·HEIC 바이트를 만든다. 실제 사진·위치를 리포에 두지 않으려고 직접 짓는다(공개 리포).

/** 사진에 넣을 정보. 빠진 것은 넣지 않는다 */
export interface ExifFields {
  /** 위도. 음수면 남위(S) */
  lat?: number;
  /** 경도. 음수면 서경(W) */
  lng?: number;
  /** `YYYY:MM:DD HH:MM:SS` (EXIF DateTimeOriginal 형식) */
  dateTimeOriginal?: string;
  /** `+09:00` (EXIF OffsetTimeOriginal 형식) */
  offsetTimeOriginal?: string;
}

const ASCII = 2;
const LONG = 4;
const RATIONAL = 5;

interface IfdEntry {
  tag: number;
  type: typeof ASCII | typeof LONG | typeof RATIONAL;
  /** ASCII는 글자, LONG은 숫자 하나, RATIONAL은 [분자, 분모] 쌍들 */
  value: string | number | [number, number][];
}

const toAsciiBytes = (text: string): number[] => [...text, "\0"].map((char) => char.charCodeAt(0));

const toDegreeRationals = (value: number): [number, number][] => {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = Math.floor((absolute - degrees) * 60);
  const seconds = Math.round(((absolute - degrees) * 60 - minutes) * 60 * 10_000);
  return [
    [degrees, 1],
    [minutes, 1],
    [seconds, 10_000],
  ];
};

/** 큰 바이트 순서(MM)의 TIFF 묶음. IFD0 → Exif IFD → GPS IFD 순서로 놓는다 */
const buildTiff = ({ lat, lng, dateTimeOriginal, offsetTimeOriginal }: ExifFields): Uint8Array<ArrayBuffer> => {
  const exifEntries: IfdEntry[] = [
    ...(dateTimeOriginal === undefined ? [] : [{ tag: 0x9003, type: ASCII, value: dateTimeOriginal } as const]),
    ...(offsetTimeOriginal === undefined ? [] : [{ tag: 0x9011, type: ASCII, value: offsetTimeOriginal } as const]),
  ];
  const gpsEntries: IfdEntry[] = [
    ...(lat === undefined ? [] : [{ tag: 1, type: ASCII, value: lat < 0 ? "S" : "N" } as const, { tag: 2, type: RATIONAL, value: toDegreeRationals(lat) } as const]),
    ...(lng === undefined ? [] : [{ tag: 3, type: ASCII, value: lng < 0 ? "W" : "E" } as const, { tag: 4, type: RATIONAL, value: toDegreeRationals(lng) } as const]),
  ];

  const bytes: number[] = [];
  const pushUint16 = (value: number) => bytes.push((value >> 8) & 0xff, value & 0xff);
  const pushUint32 = (value: number) => bytes.push((value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  const setUint32 = (at: number, value: number) => bytes.splice(at, 4, (value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);

  // IFD 하나를 쓰고, 4바이트에 안 들어가는 값은 IFD 바로 뒤에 둔다
  const writeIfd = (entries: IfdEntry[]): void => {
    const start = bytes.length;
    const dataStart = start + 2 + entries.length * 12 + 4;
    const data: number[] = [];
    pushUint16(entries.length);
    for (const { tag, type, value } of entries) {
      pushUint16(tag);
      pushUint16(type);
      if (type === LONG && typeof value === "number") {
        pushUint16(0);
        pushUint16(1);
        pushUint32(value);
        continue;
      }
      const valueBytes =
        typeof value === "string"
          ? toAsciiBytes(value)
          : (value as [number, number][]).flatMap(([numerator, denominator]) =>
              [numerator, denominator].flatMap((part) => [(part >>> 24) & 0xff, (part >> 16) & 0xff, (part >> 8) & 0xff, part & 0xff]),
            );
      pushUint32(typeof value === "string" ? valueBytes.length : (value as unknown[]).length);
      if (valueBytes.length <= 4) {
        bytes.push(...valueBytes, ...Array<number>(4 - valueBytes.length).fill(0));
      } else {
        pushUint32(dataStart + data.length);
        data.push(...valueBytes);
      }
    }
    pushUint32(0);
    bytes.push(...data);
  };

  bytes.push(0x4d, 0x4d, 0x00, 0x2a);
  pushUint32(8);
  const ifd0Entries: IfdEntry[] = [
    ...(exifEntries.length > 0 ? [{ tag: 0x8769, type: LONG, value: 0 } as const] : []),
    ...(gpsEntries.length > 0 ? [{ tag: 0x8825, type: LONG, value: 0 } as const] : []),
  ];
  writeIfd(ifd0Entries);
  // IFD0의 포인터 값 자리: 첫 항목 값은 8 + 2 + 8 위치, 다음 항목은 12바이트 뒤
  let pointerAt = 8 + 2 + 8;
  if (exifEntries.length > 0) {
    setUint32(pointerAt, bytes.length);
    writeIfd(exifEntries);
    pointerAt += 12;
  }
  if (gpsEntries.length > 0) {
    setUint32(pointerAt, bytes.length);
    writeIfd(gpsEntries);
  }
  return Uint8Array.from(bytes);
};

const EXIF_HEADER = toAsciiBytes("Exif").concat(0);

/**
 * JPEG 바이트의 맨 앞(SOI 뒤)에 사진 정보(APP1 Exif)를 넣는다. `jpeg`를 주지 않으면 그림 없는 최소 JPEG에 넣는다.
 *
 * @example const bytes = withJpegExif({ lat: 37.5444, lng: 127.0396 }, await readFile("e2e/fixtures/photo.jpg"))
 */
export const withJpegExif = (fields: ExifFields, jpeg: Uint8Array = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])): Uint8Array<ArrayBuffer> => {
  const payload = [...EXIF_HEADER, ...buildTiff(fields)];
  const length = payload.length + 2;
  const app1 = [0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...payload];
  return Uint8Array.from([...jpeg.subarray(0, 2), ...app1, ...jpeg.subarray(2)]);
};

const toBox = (kind: string, ...contents: number[][]): number[] => {
  const body = contents.flat();
  const size = body.length + 8;
  return [(size >>> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff, ...[...kind].map((char) => char.charCodeAt(0)), ...body];
};

const FULL_BOX_V0 = [0, 0, 0, 0];

/**
 * 사진 정보만 든 최소 HEIC 바이트(ftyp·meta·mdat). 그림은 없어 브라우저가 그리지 못한다. 아이폰처럼 Exif 항목 앞에 `Exif\0\0`를 둔다.
 *
 * @example const bytes = buildHeicWithExif({ lat: 37.5444, lng: 127.0396 })
 */
export const buildHeicWithExif = (fields: ExifFields): Uint8Array<ArrayBuffer> => {
  const exifItem = [0, 0, 0, 6, ...EXIF_HEADER, ...buildTiff(fields)];
  const ftyp = toBox("ftyp", [..."heic"].map((char) => char.charCodeAt(0)), [0, 0, 0, 0], [..."mif1heic"].map((char) => char.charCodeAt(0)));
  const hdlr = toBox("hdlr", FULL_BOX_V0, [0, 0, 0, 0], [..."pict"].map((char) => char.charCodeAt(0)), Array<number>(12).fill(0), [0]);
  const infe = toBox("infe", [2, 0, 0, 0], [0, 1], [0, 0], [..."Exif"].map((char) => char.charCodeAt(0)), [0]);
  const iinf = toBox("iinf", FULL_BOX_V0, [0, 1], infe);
  // iloc 크기는 내용과 상관없이 정해져 있어, Exif 위치(mdat 안)를 먼저 셀 수 있다
  const ilocSize = 8 + 4 + 2 + 2 + (2 + 2 + 2 + 4 + 4);
  const metaSize = 8 + 4 + hdlr.length + iinf.length + ilocSize;
  const exifOffset = ftyp.length + metaSize + 8;
  const iloc = toBox(
    "iloc",
    FULL_BOX_V0,
    [0x44, 0x00],
    [0, 1],
    [0, 1],
    [0, 0],
    [0, 1],
    [(exifOffset >>> 24) & 0xff, (exifOffset >> 16) & 0xff, (exifOffset >> 8) & 0xff, exifOffset & 0xff],
    [(exifItem.length >>> 24) & 0xff, (exifItem.length >> 16) & 0xff, (exifItem.length >> 8) & 0xff, exifItem.length & 0xff],
  );
  const meta = toBox("meta", FULL_BOX_V0, hdlr, iinf, iloc);
  return Uint8Array.from([...ftyp, ...meta, ...toBox("mdat", exifItem)]);
};
