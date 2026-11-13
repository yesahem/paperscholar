import { describe, expect, test } from "bun:test";
import { createLogEmailSender } from "../../../src/adapters/email/log";
import {
  createResendEmailSender,
  RESEND_ENDPOINT,
} from "../../../src/adapters/email/resend";
import { createSmtpEmailSender } from "../../../src/adapters/email/smtp";
import { EmailDeliveryError } from "../../../src/adapters/email/types";
import {
  passwordResetEmail,
  verificationEmail,
} from "../../../src/services/email-templates";

const message = verificationEmail(
  "ada@example.com",
  "https://example.com/verify?token=a&b=c",
);

describe("templates", () => {
  test("the text carries the link and the HTML escapes it", () => {
    expect(message.text).toContain("https://example.com/verify?token=a&b=c");
    expect(message.html).toContain('href="https://example.com/verify?token=a&amp;b=c"');
    expect(passwordResetEmail("ada@example.com", "https://x.example").subject).toContain(
      "Reset",
    );
  });
});

describe("log driver", () => {
  test("prints the email instead of sending it", async () => {
    const lines: string[] = [];
    await createLogEmailSender((text) => lines.push(text)).send(message);
    expect(lines.join("\n")).toContain("To: ada@example.com");
    expect(lines.join("\n")).toContain("token=a&b=c");
  });
});

describe("resend driver", () => {
  test("posts the message with the API key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const sender = createResendEmailSender({
      apiKey: "test-api-key",
      from: "PaperScholar <hi@example.com>",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return Response.json({ id: "email_1" });
      },
    });
    await sender.send(message);

    expect(calls[0]?.url).toBe(RESEND_ENDPOINT);
    expect(new Headers(calls[0]?.init.headers).get("Authorization")).toBe(
      "Bearer test-api-key",
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      from: "PaperScholar <hi@example.com>",
      to: ["ada@example.com"],
      subject: message.subject,
    });
  });

  test("a refusal or an unexpected answer is a delivery error without details", async () => {
    for (const response of [
      new Response("nope", { status: 422 }),
      Response.json({ unexpected: true }),
    ]) {
      const sender = createResendEmailSender({
        apiKey: "test-secret-key",
        from: "a@example.com",
        fetch: async () => response,
      });
      const error = await sender.send(message).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(EmailDeliveryError);
      expect(String(error)).not.toContain("test-secret-key");
      expect(String(error)).not.toContain("ada@example.com");
    }
  });
});

describe("smtp driver", () => {
  const options = {
    from: "hi@example.com",
    host: "smtp.example.com",
    port: 587,
    secure: false,
    auth: null,
  };

  test("hands the message to the transport", async () => {
    const sent: unknown[] = [];
    await createSmtpEmailSender(options, {
      sendMail: async (mail) => {
        sent.push(mail);
        return {};
      },
    }).send(message);
    expect(sent[0]).toMatchObject({ from: "hi@example.com", to: "ada@example.com" });
  });

  test("keeps only the error code, never the server's reply", async () => {
    const failure = Object.assign(new Error("550 <ada@example.com> unknown"), {
      code: "EENVELOPE",
    });
    const sender = createSmtpEmailSender(options, {
      sendMail: async () => {
        throw failure;
      },
    });
    const error = await sender.send(message).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect(String(error)).toContain("EENVELOPE");
    expect(String(error)).not.toContain("ada@example.com");
  });
});
