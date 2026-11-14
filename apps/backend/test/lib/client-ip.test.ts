import { describe, expect, test } from "bun:test";
import { clientIp } from "../../src/lib/client-ip";

const headers = (value: string | null) =>
  new Headers(value === null ? {} : { "x-forwarded-for": value });

describe("clientIp", () => {
  const direct = { header: "x-forwarded-for", trustedProxies: [] };

  test("reads a single address set by the proxy", () => {
    expect(clientIp(headers("203.0.113.7"), direct)).toBe("203.0.113.7");
  });

  test("without trusted proxies, a chain is not trusted: its first hop could be forged", () => {
    expect(clientIp(headers("1.2.3.4, 203.0.113.7"), direct)).toBeNull();
    expect(clientIp(headers(null), direct)).toBeNull();
    expect(clientIp(headers("not an address"), direct)).toBeNull();
  });

  test("with trusted proxies, takes the last hop that is not one of them", () => {
    const behindProxy = { header: "x-forwarded-for", trustedProxies: ["10.0.0.0/8"] };
    expect(clientIp(headers("1.2.3.4, 203.0.113.7, 10.0.0.2"), behindProxy)).toBe(
      "203.0.113.7",
    );
  });
});
