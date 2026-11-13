/** One outgoing email. Text-first: `html` carries the same words. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends email (docs/specs/06-auth.md §5). Drivers: `resend`, `smtp` and `log`.
 * An instance without a driver has no sender at all, and the features that
 * need one switch off.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Delivery failed. The message is safe to log: it never holds the address, body or credentials. */
export class EmailDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmailDeliveryError";
  }
}
