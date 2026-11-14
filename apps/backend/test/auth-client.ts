import type { App } from "../src/create-app";

export const WEB_ORIGIN = "http://localhost:3000";

/**
 * A browser stand-in: keeps cookies between requests, sends the web app's
 * Origin on writes and a fixed client address, as the proxy would.
 */
export class TestBrowser {
  readonly cookies = new Map<string, string>();

  constructor(
    private readonly app: App,
    readonly ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
  ) {}

  /** The Cookie header, optionally without some cookies. */
  cookieHeader(exclude: (name: string) => boolean = () => false): string {
    return [...this.cookies]
      .filter(([name]) => !exclude(name))
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async request(
    path: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const method = init.method ?? "GET";
    const headers: Record<string, string> = {
      "x-forwarded-for": this.ip,
      ...(method === "GET" ? {} : { Origin: WEB_ORIGIN }),
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(this.cookies.size > 0 ? { Cookie: this.cookieHeader() } : {}),
      ...init.headers,
    };
    const response = await this.app.request(path, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    this.store(response);
    return response;
  }

  /** Sends `form` as multipart/form-data, as a browser's file upload would. */
  async upload(path: string, form: FormData, method = "POST"): Promise<Response> {
    const response = await this.app.request(path, {
      method,
      headers: {
        "x-forwarded-for": this.ip,
        Origin: WEB_ORIGIN,
        ...(this.cookies.size > 0 ? { Cookie: this.cookieHeader() } : {}),
      },
      body: form,
    });
    this.store(response);
    return response;
  }

  private store(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = header.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = attributes.some(
        (attribute) => attribute.trim().toLowerCase() === "max-age=0",
      );
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  signUp(account: { email: string; username: string; password?: string }) {
    return this.request("/api/auth/sign-up/email", {
      method: "POST",
      body: {
        email: account.email,
        username: account.username,
        name: account.username,
        password: account.password ?? "correct horse battery",
      },
    });
  }

  signIn(email: string, password = "correct horse battery") {
    return this.request("/api/auth/sign-in/email", {
      method: "POST",
      body: { email, password },
    });
  }

  signOut() {
    return this.request("/api/auth/sign-out", { method: "POST", body: {} });
  }
}

/** The first link in an email's text. */
export function linkIn(text: string): URL {
  const match = /https?:\/\/\S+/.exec(text);
  if (!match) throw new Error("The email contains no link");
  return new URL(match[0]);
}
