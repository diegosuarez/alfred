import { useEffect, useState } from 'react';

import { getToken } from '../services/api';

// Module-level cache so multiple components asking for the same URL
// share the same object URL and we don't hammer the backend.
const cache = new Map<string, string>();

/** Fetch `url` with the user's bearer token and return a blob URL the
 * browser can render directly. Returns `undefined` until the bytes are
 * in. Skips work when `url` is null/empty.
 */
export function useAuthedImage(url?: string | null): string | undefined {
  const [src, setSrc] = useState<string | undefined>(
    url ? cache.get(url) : undefined,
  );

  useEffect(() => {
    if (!url) {
      setSrc(undefined);
      return;
    }
    const cached = cache.get(url);
    if (cached) {
      setSrc(cached);
      return;
    }
    let cancelled = false;
    const token = getToken();
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.blob();
      })
      .then((b) => URL.createObjectURL(b))
      .then((objUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objUrl);
          return;
        }
        cache.set(url, objUrl);
        setSrc(objUrl);
      })
      .catch(() => {
        // Swallow — caller renders a fallback icon when src stays undefined.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return src;
}
