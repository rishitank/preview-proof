/**
 * SSRF guard: decides whether a URL or a resolved IP address is safe to fetch
 * from the server. Pure functions only, so they can be unit tested exhaustively.
 */

export type GuardError = {
  ok: false;
  code: "invalid_url" | "blocked_host" | "blocked_port";
  message: string;
};

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
  ".lan",
];

/** Parses dotted-quad IPv4. Returns the four octets, or null if it isn't one. */
export function parseIPv4(host: string): [number, number, number, number] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map(Number) as [number, number, number, number];
  return parts.every((n) => n <= 255) ? parts : null;
}

/** True for any IPv4 address that is not ordinary public unicast (RFC 6890 special-purpose ranges). */
export function isPrivateIPv4(host: string): boolean {
  const ip = parseIPv4(host);
  if (!ip) return /^\d+\.\d+\.\d+\.\d+$/.test(host); // malformed dotted-quad: treat as unsafe
  const [a, b, c] = ip;
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expands an IPv6 address (optionally with an embedded IPv4 tail) to 8 hextets. */
export function parseIPv6(input: string): number[] | null {
  let h = input.replace(/^\[|\]$/g, "").toLowerCase();
  const zone = h.indexOf("%");
  if (zone !== -1) h = h.slice(0, zone);
  if (!h.includes(":")) return null;

  // Convert an embedded IPv4 tail (e.g. ::ffff:127.0.0.1) into two hextets.
  const lastColon = h.lastIndexOf(":");
  const tail = h.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    h = `${h.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }

  const halves = h.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** True for any IPv6 address that is not ordinary public unicast, including IPv4 embedded in IPv6. */
export function isPrivateIPv6(host: string): boolean {
  const g = parseIPv6(host);
  if (!g) return host.includes(":"); // unparseable IPv6-looking input: treat as unsafe
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const zeroTo = (n: number) => g.slice(0, n).every((x) => x === 0);

  if (zeroTo(8)) return true; // ::
  if (zeroTo(7) && g7 === 1) return true; // ::1
  if (zeroTo(5) && g5 === 0xffff) return isPrivateIPv4(v4From(g6, g7)); // IPv4-mapped
  if (zeroTo(6)) return true; // IPv4-compatible (deprecated): never legitimate on the public internet
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPrivateIPv4(v4From(g6, g7)); // NAT64 well-known prefix
  }
  // Allowlist, not blocklist: only global unicast (2000::/3) can be public. This rules out
  // unique-local, link-local, site-local, multicast, discard-only, local-use NAT64, SRv6 SIDs,
  // IPv4-translated and every range IANA assigns in future outside 2000::/3.
  if ((g0 & 0xe000) !== 0x2000) return true;
  if (g0 === 0x2001 && g1 < 0x200) return true; // 2001::/23 IETF: Teredo, benchmarking, ORCHID
  if (g0 === 0x2001 && g1 === 0xdb8) return true; // documentation
  if (g0 === 0x3fff && g1 < 0x1000) return true; // documentation 3fff::/20
  if (g0 === 0x2002) return isPrivateIPv4(v4From(g1, g2)); // 6to4 embeds an IPv4 address
  return false;
}

export function isIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  return parseIPv4(h) !== null || h.includes(":");
}

/** True only when there is at least one address and every address is public. */
export function areResolvedAddressesSafe(addresses: string[]): boolean {
  if (addresses.length === 0) return false;
  // Anything that doesn't parse as an IP address (a malformed DNS answer) is unsafe.
  return addresses.every((a) =>
    parseIPv4(a) !== null ? !isPrivateIPv4(a) : parseIPv6(a) !== null && !isPrivateIPv6(a),
  );
}

/**
 * Validates a user-supplied or redirect-supplied URL before any network access.
 * Adds https:// when the scheme is missing. Hostname-level checks only; DNS is checked separately.
 */
export function validateTargetUrl(raw: string): { ok: true; url: URL } | GuardError {
  let candidate = raw.trim();
  if (!candidate) return { ok: false, code: "invalid_url", message: "Please paste a URL first." };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate))
    candidate = `https://${candidate.replace(/^\/+/, "")}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return {
      ok: false,
      code: "invalid_url",
      message: "That doesn't look like a valid web address.",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      code: "invalid_url",
      message: "Only http:// and https:// addresses can be checked.",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      code: "invalid_url",
      message: "Addresses with a username or password can't be checked.",
    };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const bare = host.replace(/^\[|\]$/g, "");
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) ||
    (parseIPv4(bare) !== null && isPrivateIPv4(bare)) ||
    (bare.includes(":") && isPrivateIPv6(bare))
  ) {
    return {
      ok: false,
      code: "blocked_host",
      message:
        "That address points at a private or local machine, so nobody on the internet could load it.",
    };
  }

  if (!host.includes(".") && !isIpLiteral(host)) {
    return {
      ok: false,
      code: "invalid_url",
      message: "That address needs a full domain name, like yourapp.lovable.app.",
    };
  }

  if (url.port && url.port !== "80" && url.port !== "443") {
    return {
      ok: false,
      code: "blocked_port",
      message: "Only standard web ports (80 and 443) can be checked.",
    };
  }

  url.hash = "";
  return { ok: true, url };
}
