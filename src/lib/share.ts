// Share links: the program (one file, or the whole project), its stdin and
// its arguments, compressed into the URL fragment (#s=...). The fragment
// never reaches the server.

export interface Shared {
  /** The shared file's text (for a project, the file that was open). */
  code: string;
  stdin?: string;
  args?: string[];
  /** A multi-file project: every file by path. */
  files?: Record<string, string>;
  /** The project's entry point and the file that was open. */
  entry?: string;
  active?: string;
}

const PREFIX = "s=";
/** Browsers and chat apps cope with URLs well beyond this, but not much more. */
export const MAX_SHARE_URL = 60_000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeShare(s: Shared): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(s));
  return PREFIX + toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

/** Decode a location.hash (with or without "#"); null if it is not a share link. */
export async function decodeShare(hash: string): Promise<Shared | null> {
  const h = hash.replace(/^#/, "");
  if (!h.startsWith(PREFIX)) return null;
  try {
    const bytes = await pipe(fromBase64Url(h.slice(PREFIX.length)), new DecompressionStream("deflate-raw"));
    const v = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Shared>;
    if (typeof v.code !== "string") return null;
    const files =
      v.files && typeof v.files === "object" && !Array.isArray(v.files)
        ? Object.fromEntries(Object.entries(v.files).filter((e): e is [string, string] => typeof e[1] === "string"))
        : undefined;
    return {
      code: v.code,
      stdin: typeof v.stdin === "string" ? v.stdin : undefined,
      args: Array.isArray(v.args) ? v.args.filter((a): a is string => typeof a === "string") : undefined,
      files: files && Object.keys(files).length ? files : undefined,
      entry: typeof v.entry === "string" ? v.entry : undefined,
      active: typeof v.active === "string" ? v.active : undefined,
    };
  } catch {
    return null;
  }
}
