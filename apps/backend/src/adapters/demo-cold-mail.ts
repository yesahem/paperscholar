import type { ScriptedAnswer } from "@repo/pipeline";

/**
 * The fake model's cold-mail draft (`LLM_DRIVER=fake`, development only): a
 * fixed letter addressed from the request, so the screens can be exercised
 * without an API key. It reads nothing from the CV.
 */
export const demoColdMailAnswer: ScriptedAnswer = (request) => {
  const field = (name: string) =>
    new RegExp(`^${name}: (.+)$`, "m").exec(request.prompt)?.[1]?.trim() ?? "";
  const recipient = field("Recipient name") || "there";
  const organisation = field("Organisation") || "your organisation";
  return {
    subject: `Question about opportunities at ${organisation}`,
    body: [
      `Dear ${recipient},`,
      `I am writing to ask whether ${organisation} might have room for someone with my background. This draft was written by the development stand-in for the model, so it does not mention anything from your CV.`,
      "Would you have ten minutes for a short call in the coming weeks?",
      "Best regards,",
    ].join("\n\n"),
    highlights: ["Development draft: no facts from the CV were used"],
  };
};
