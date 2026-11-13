import { createTransport } from "nodemailer";
import { EmailDeliveryError, type EmailMessage, type EmailSender } from "./types";

export interface SmtpOptions {
  from: string;
  host: string;
  port: number;
  /** TLS from the first byte (port 465). Otherwise STARTTLS is used when offered. */
  secure: boolean;
  auth: { user: string; password: string } | null;
}

/** The part of a nodemailer transport this driver uses. */
export interface MailTransport {
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

/** Sends through any SMTP server. */
export function createSmtpEmailSender(
  options: SmtpOptions,
  transport: MailTransport = createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    ...(options.auth
      ? { auth: { user: options.auth.user, pass: options.auth.password } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  }),
): EmailSender {
  return {
    async send(message: EmailMessage) {
      try {
        await transport.sendMail({
          from: options.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch (error) {
        // Server replies can quote the recipient, so only the error code is kept.
        throw new EmailDeliveryError(
          `The SMTP server did not accept the message (${smtpErrorCode(error)})`,
        );
      }
    },
  };
}

function smtpErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }
  return "unknown error";
}
