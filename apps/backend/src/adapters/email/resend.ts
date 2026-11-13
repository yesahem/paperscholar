import { z } from "zod";
import { EmailDeliveryError, type EmailMessage, type EmailSender } from "./types";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

const responseSchema = z.object({ id: z.string() });

export interface ResendOptions {
  apiKey: string;
  from: string;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
}

/** Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendEmailSender({
  apiKey,
  from,
  fetch: fetchImpl = fetch,
}: ResendOptions): EmailSender {
  return {
    async send(message: EmailMessage) {
      let response: Response;
      try {
        response = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        throw new EmailDeliveryError("Resend could not be reached", { cause: error });
      }
      if (!response.ok) {
        throw new EmailDeliveryError(`Resend answered HTTP ${response.status}`);
      }
      const body = responseSchema.safeParse(await response.json().catch(() => null));
      if (!body.success) {
        throw new EmailDeliveryError("Resend's response did not include a message id");
      }
    },
  };
}
