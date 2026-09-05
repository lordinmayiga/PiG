/**
 * Ranged HTTP chunked download, built against the raw-file endpoint's Range
 * support (backend/src/httpFiles.ts). Pulls a file a fixed-size slice at a
 * time via `Range: bytes=<start>-<end>` instead of one all-or-nothing
 * request, so a caller gets: real byte progress (from `Content-Range`'s
 * `/<total>`), a chance to render the first slice before the rest arrives,
 * and true cancellation — aborting `signal` stops the in-flight `fetch`,
 * which closes the connection, which the server's `res.on('close', ...)`
 * already turns into `stream.destroy()` (see httpFiles.ts) so the VPS also
 * stops reading the file the moment a viewer cancels.
 */

export interface ChunkedFetchOptions {
  /** Bytes requested per Range request. 64KB per the file-explorer plan's Q1 — enough to fill a screen or two of code immediately, small enough that a cancel feels instant on a slow link. */
  chunkSize?: number;
  signal?: AbortSignal;
  /** Called after each chunk with the text decoded *so far*, for progressive rendering. */
  onChunk?: (textSoFar: string, loadedBytes: number, totalBytes: number | undefined) => void;
}

const DEFAULT_CHUNK_SIZE = 64 * 1024;

function parseTotalFromHeaders(headers: Headers): number | undefined {
  // 206 responses carry "Content-Range: bytes <start>-<end>/<total>".
  const contentRange = headers.get('Content-Range');
  if (contentRange) {
    const match = /\/(\d+)\s*$/.exec(contentRange);
    if (match) return parseInt(match[1], 10);
  }
  // A server that ignored Range and returned a plain 200 still reports the
  // whole file's size via Content-Length.
  const contentLength = headers.get('Content-Length');
  if (contentLength) return parseInt(contentLength, 10);
  return undefined;
}

/**
 * Downloads a text file in fixed-size Range chunks, decoding incrementally
 * (a `TextDecoder` kept across chunks so a multi-byte UTF-8 character split
 * across a chunk boundary decodes correctly instead of producing a mangled
 * character at the seam). Resolves with the full text; `onChunk` fires
 * after every slice for progressive display.
 */
export async function fetchTextChunked(url: string, options: ChunkedFetchOptions = {}): Promise<string> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const decoder = new TextDecoder('utf-8');
  let text = '';
  let loaded = 0;
  let total: number | undefined;
  let start = 0;

  // Safety valve: if a server response somehow never signals completion
  // (no Content-Range/Content-Length and returns a full chunkSize every
  // time), this caps the loop instead of spinning forever. 100k chunks at
  // the default 64KB size is 6.4GB — far past anything this viewer should
  // ever be asked to preview.
  const MAX_ITERATIONS = 100_000;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const end = start + chunkSize - 1;
    const res = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: options.signal,
    });

    if (res.status === 416) {
      // Range not satisfiable — for start === 0 this just means an empty
      // file; anything else means our own accounting is wrong, but either
      // way there's nothing more to read.
      break;
    }
    if (res.status !== 206 && res.status !== 200) {
      throw new Error(`Server returned ${res.status} while downloading file`);
    }

    if (total === undefined) {
      total = parseTotalFromHeaders(res.headers);
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) break;

    loaded += buf.byteLength;
    // A 200 (server ignored Range, sent the whole file) reports its own
    // full length as `total`, so loaded >= total is already true here —
    // isLast correctly fires on the first and only iteration.
    const isLast = total !== undefined ? loaded >= total : buf.byteLength < chunkSize;
    text += decoder.decode(buf, { stream: !isLast });
    options.onChunk?.(text, loaded, total);

    if (isLast) break;
    start += buf.byteLength;
  }

  return text;
}
