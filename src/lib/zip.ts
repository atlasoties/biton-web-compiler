// Minimal ZIP reading and writing for project import/export, built on the
// platform's CompressionStream ("deflate-raw"), so no dependency is needed.
// Writes deflated entries with UTF-8 names; reads stored and deflated
// entries (what every common zip tool produces) and skips everything else.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** DOS date/time for the archive entries. */
function dosDateTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

/** Build a .zip of path → text (paths ending in "/" become folder entries). */
export async function zip(entries: Record<string, string>, now = new Date()): Promise<Blob> {
  const enc = new TextEncoder();
  const [time, date] = dosDateTime(now);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = enc.encode(name);
    const isDir = name.endsWith("/");
    const data = isDir ? new Uint8Array() : enc.encode(text);
    const compressed = isDir ? data : await transform(data, new CompressionStream("deflate-raw"));
    const method = isDir ? 0 : 8;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 0x0314, true); // made by: unix, 2.0
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(38, (isDir ? 0o40755 : 0o100644) << 16, true); // unix mode
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    parts.push(local, compressed);
    central.push(cd);
    offset += local.length + compressed.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end] as BlobPart[], { type: "application/zip" });
}

export class ZipError extends Error {}

export interface UnzippedEntry {
  name: string;
  /** Decompressed bytes; empty for folders. */
  data: Uint8Array;
  isDir: boolean;
}

/**
 * Read a .zip. Entries larger than `maxEntryBytes` (uncompressed) or using
 * unsupported compression are skipped and listed in `skipped`.
 */
export async function unzip(bytes: Uint8Array, maxEntryBytes = 1 << 20): Promise<{ entries: UnzippedEntry[]; skipped: string[] }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record is in the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("not a zip file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries: UnzippedEntry[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new ZipError("damaged zip file");
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    const isDir = name.endsWith("/");
    if (isDir) {
      entries.push({ name, data: new Uint8Array(), isDir });
      continue;
    }
    if ((method !== 0 && method !== 8) || size > maxEntryBytes || compSize === 0xffffffff) {
      skipped.push(name);
      continue;
    }
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new ZipError("damaged zip file");
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + compSize);
    const data = method === 0 ? raw.slice() : await transform(raw, new DecompressionStream("deflate-raw"));
    if (data.length !== size) throw new ZipError(`damaged entry ${name}`);
    entries.push({ name, data, isDir });
  }
  return { entries, skipped };
}
