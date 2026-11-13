import type { EmailConfig } from "../../env";
import { createLogEmailSender } from "./log";
import { createResendEmailSender } from "./resend";
import { createSmtpEmailSender } from "./smtp";
import type { EmailSender } from "./types";

/** The configured sender, or null when this instance sends no email. */
export function createEmailSender(config: EmailConfig): EmailSender | null {
  switch (config.driver) {
    case "none":
      return null;
    case "log":
      return createLogEmailSender();
    case "resend":
      return createResendEmailSender({ apiKey: config.apiKey, from: config.from });
    case "smtp":
      return createSmtpEmailSender(config);
  }
}
