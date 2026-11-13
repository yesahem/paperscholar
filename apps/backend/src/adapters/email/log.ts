import type { EmailMessage, EmailSender } from "./types";

/**
 * Development driver: prints each email, links included, instead of sending
 * it. Refused in production by env.ts, because the links sign people in.
 */
export function createLogEmailSender(
  write: (text: string) => void = (text) => console.log(text),
): EmailSender {
  return {
    async send(message: EmailMessage) {
      write(
        [
          "──── email (EMAIL_DRIVER=log, not sent) ────",
          `To: ${message.to}`,
          `Subject: ${message.subject}`,
          "",
          message.text,
          "────────────────────────────────────────────",
        ].join("\n"),
      );
    },
  };
}
