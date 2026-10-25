import { promises as dns } from "node:dns";
import net from "node:net";

/**
 * SSRF-safe fetch for URLs that ultimately come from untrusted user input
 * (a link pasted into a post). Must only ever run in the Node.js runtime
 * (app/api/link-preview/route.ts sets `export const runtime = "nodejs"`) —
 * the `node:dns` / `node:net` imports do not exist on the Edge runtime.
 *
 * Defenses:
 *   - only http/https accepted
 *   - the hostname is resolved via DNS and every returned address is
 *     checked against private/loopback/link-local/reserved ranges before
 *     the request is made — both for the original URL and for every
 *     redirect hop (redirects are followed manually, never automatically,
 *     up to MAX_REDIRECTS hops)
 *   - a hard timeout and a response-size cap
 *
 * Known accepted residual risk (documented deliberately, not hidden): the
 * DNS check here and the TCP connection `fetch()` itself makes happen a
 * few milliseconds apart, and `fetch()` re-resolves the hostname rather
 * than connecting to the exact address this function validated — so a DNS
 * answer that changes between the two (DNS rebinding) is not fully closed
 * off. Pinning the validated IP for the actual connection would close this
 * gap but adds meaningful complexity (a custom Agent/dispatcher) for what
 * this feature is — PM-accepted trade-off per the 2026-10-27 design review.
 */

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MiB
const USER_AGENT = "KanomiyuFanCommunityBot/1.0 (+https://kanomiyu-fan.jp)";

export class UnsafeUrlError extends Error {}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

// Private/loopback/link-local/reserved IPv4 ranges (RFC 1918, RFC 5737,
// RFC 6598, RFC 3927, loopback, multicast, "limited broadcast", etc.).
const PRIVATE_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
  ["255.255.255.255", 32],
];

function isPrivateIPv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const mask = (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") {
    return true;
  }
  if (normalized.startsWith("fe80:") || normalized.startsWith("fec0:")) {
    return true; // link-local
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true; // unique local (fc00::/7)
  }
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (net.isIP(mapped) === 4) {
      return isPrivateIPv4(mapped);
    }
  }
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // unparseable — fail closed
}

async function assertHostnameIsPublic(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UnsafeUrlError("PRIVATE_ADDRESS");
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError("DNS_LOOKUP_FAILED");
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError("DNS_LOOKUP_FAILED");
  }

  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new UnsafeUrlError("PRIVATE_ADDRESS");
    }
  }
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf-8");
}

export type SafeFetchResult = {
  body: string;
  finalUrl: string;
  contentType: string | null;
};

export async function safeFetch(targetUrl: string): Promise<SafeFetchResult> {
  let currentUrl = targetUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new UnsafeUrlError("INVALID_URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new UnsafeUrlError("UNSUPPORTED_PROTOCOL");
    }

    await assertHostnameIsPublic(parsed.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(parsed.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        },
      });
    } catch {
      throw new UnsafeUrlError("FETCH_FAILED");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new UnsafeUrlError("REDIRECT_WITHOUT_LOCATION");
      }
      currentUrl = new URL(location, parsed).toString();
      continue;
    }

    if (!response.ok) {
      throw new UnsafeUrlError(`HTTP_${response.status}`);
    }

    const body = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);
    return { body, finalUrl: parsed.toString(), contentType: response.headers.get("content-type") };
  }

  throw new UnsafeUrlError("TOO_MANY_REDIRECTS");
}
