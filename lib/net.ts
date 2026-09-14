import dns from 'node:dns/promises';
import net from 'node:net';

// Same per-request budget as the callers that use this (see FETCH_TIMEOUT_MS
// in lib/crawler.ts and lib/discovery.ts) -- this module doesn't own retry
// logic, just validation + redirect-following, so it borrows their timeout
// via the AbortSignal the caller passes in `init`.
const MAX_REDIRECTS = 5;

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true; // malformed -> unsafe
  const [a, b, c] = parts;
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast (224-239) + reserved (240-255)
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true; // loopback / unspecified
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local
  if (normalized.startsWith('ff')) return true; // multicast
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]); // IPv4-mapped IPv6
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // not a recognizable literal -> treat as unsafe rather than silently allowing
}

/**
 * Throws if `urlString` isn't a plain http(s) URL that resolves to a public,
 * routable address. Resolves the hostname via DNS (a literal IP resolves
 * trivially through the same call) so a public-looking hostname that
 * actually points at a loopback/private/link-local address -- including
 * cloud metadata endpoints like 169.254.169.254 -- is caught, not just an IP
 * typed directly into the URL. User-supplied and resolver-discovered target
 * URLs both flow straight into a server-side fetch (lib/crawler.ts,
 * lib/discovery.ts) with no other boundary in front of them, so this is the
 * only thing stopping an audit target from being used to probe internal
 * infrastructure.
 */
export async function assertPublicHttpUrl(urlString: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Refusing to fetch non-http(s) URL: ${urlString}`);
  }
  if (url.username || url.password) {
    throw new Error(`Refusing to fetch a URL with embedded credentials: ${urlString}`);
  }

  const hostname = url.hostname;
  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }
  if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) {
    throw new Error(`Refusing to fetch a private/internal address: ${hostname}`);
  }
}

/**
 * fetch() that validates the target -- and every redirect hop -- against
 * assertPublicHttpUrl before issuing it. Plain fetch() with its default
 * automatic-redirect behavior would let an attacker-controlled external URL
 * 302 its way to an internal address after the initial check already
 * passed; following redirects manually one hop at a time closes that gap.
 * `init.signal` (the caller's own timeout AbortController) applies to every
 * hop, so total wall-clock time stays bounded the same way a single fetch
 * call would be.
 */
export async function safeFetch(urlString: string, init: RequestInit = {}, maxRedirects = MAX_REDIRECTS): Promise<Response> {
  let currentUrl = urlString;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHttpUrl(currentUrl);
    const res = await fetch(currentUrl, { ...init, redirect: 'manual' });
    const isRedirect = res.status >= 300 && res.status < 400;
    const location = isRedirect ? res.headers.get('location') : null;
    if (location) {
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects fetching ${urlString}`);
}
