import { describe, expect, it } from "vitest";
import {
  areResolvedAddressesSafe,
  isPrivateIPv4,
  isPrivateIPv6,
  parseIPv6,
  validateTargetUrl,
} from "./net-guard";

describe("isPrivateIPv4", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
    "999.1.1.1",
  ])("blocks %s", (ip) => expect(isPrivateIPv4(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.128.0.1", "192.169.0.1"])(
    "allows public %s",
    (ip) => expect(isPrivateIPv4(ip)).toBe(false),
  );
});

describe("parseIPv6", () => {
  it("expands compressed forms", () => {
    expect(parseIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("[2001:db8::1]")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("::ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
  });
  it("rejects malformed input", () => {
    expect(parseIPv6("1::2::3")).toBeNull();
    expect(parseIPv6("12345::")).toBeNull();
    expect(parseIPv6("1:2:3:4:5:6:7:8:9")).toBeNull();
  });
});

describe("isPrivateIPv6", () => {
  it.each([
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1", // the form the URL parser normalises [::ffff:127.0.0.1] to
    "::ffff:a9fe:a9fe", // 169.254.169.254 (cloud metadata)
    "::127.0.0.1",
    "64:ff9b::a00:1", // NAT64 of 10.0.0.1
    "2002:c0a8:0101::1", // 6to4 of 192.168.1.1
    "2001:0:4136:e378::1", // Teredo
    "2001:db8::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%eth0",
    "ff02::1",
    "not:an:ip:::",
  ])("blocks %s", (ip) => expect(isPrivateIPv6(ip)).toBe(true));

  it.each([
    "2606:4700:4700::1111",
    "2a00:1450:4009:81f::200e",
    "64:ff9b::808:808",
    "2002:0808:0808::1",
  ])("allows public %s", (ip) => expect(isPrivateIPv6(ip)).toBe(false));
});

describe("areResolvedAddressesSafe", () => {
  it("needs at least one address and every address public", () => {
    expect(areResolvedAddressesSafe(["93.184.216.34", "2606:2800:220:1::1"])).toBe(true);
    expect(areResolvedAddressesSafe(["93.184.216.34", "10.0.0.5"])).toBe(false);
    expect(areResolvedAddressesSafe(["::ffff:7f00:1"])).toBe(false);
    expect(areResolvedAddressesSafe([])).toBe(false);
  });
});

describe("validateTargetUrl", () => {
  const ok = (input: string) => {
    const r = validateTargetUrl(input);
    if (!r.ok) throw new Error(`expected ok for ${input}: ${r.message}`);
    return r.url.toString();
  };
  const code = (input: string) => {
    const r = validateTargetUrl(input);
    return r.ok ? "ok" : r.code;
  };

  it("adds https:// and strips fragments", () => {
    expect(ok("myapp.lovable.app")).toBe("https://myapp.lovable.app/");
    expect(ok("  https://example.com/a?b=1#frag ")).toBe("https://example.com/a?b=1");
    expect(ok("//example.com/x")).toBe("https://example.com/x");
    expect(ok("http://example.com:80/")).toBe("http://example.com/");
  });

  it.each([
    ["", "invalid_url"],
    ["   ", "invalid_url"],
    ["javascript:alert(1)", "invalid_url"],
    ["file:///etc/passwd", "invalid_url"],
    ["ftp://example.com", "invalid_url"],
    ["data:text/html,hi", "invalid_url"],
    ["https://user:pass@example.com", "invalid_url"],
    ["https://intranet", "invalid_url"],
    ["http://[::1", "invalid_url"],
  ])("rejects %j as %s", (input, expected) => expect(code(input)).toBe(expected));

  it.each([
    "localhost",
    "http://localhost:80",
    "LOCALHOST.",
    "http://127.0.0.1",
    "http://2130706433", // decimal 127.0.0.1
    "http://0x7f.1", // hex shorthand
    "http://0177.0.0.1", // octal
    "http://127.1",
    "http://0.0.0.0",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal",
    "https://printer.local",
    "https://foo.localhost",
    "https://router.home.arpa",
  ])("blocks private target %s", (input) => expect(code(input)).toBe("blocked_host"));

  it.each(["https://example.com:8080", "http://example.com:22", "https://example.com:6379"])(
    "blocks non-standard port %s",
    (input) => expect(code(input)).toBe("blocked_port"),
  );

  it("allows public IP literals and standard ports", () => {
    expect(code("http://93.184.216.34/")).toBe("ok");
    expect(code("https://example.com:443/")).toBe("ok");
    expect(code("https://[2606:4700:4700::1111]/")).toBe("ok");
  });
});

describe("IPv6 special ranges and malformed DNS answers", () => {
  it.each([
    "2001:2::1", // benchmarking
    "2001:10::1", // ORCHID
    "2001:20::1", // ORCHIDv2
    "3fff::1", // documentation 3fff::/20
    "5f00::1", // SRv6 SIDs
    "::ffff:0:a00:1", // IPv4-translated
    "4000::1", // outside global unicast
  ])("treats %s as unsafe", (addr) => {
    expect(isPrivateIPv6(addr)).toBe(true);
  });

  it("still allows ordinary public IPv6", () => {
    expect(isPrivateIPv6("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateIPv6("2a00:1450:4009:81f::200e")).toBe(false);
  });

  it("rejects DNS answers that aren't IP addresses", () => {
    expect(areResolvedAddressesSafe(["1.2.3.4.5"])).toBe(false);
    expect(areResolvedAddressesSafe(["93.184.216.34", "not-an-ip"])).toBe(false);
    expect(areResolvedAddressesSafe(["93.184.216.34"])).toBe(true);
  });
});
