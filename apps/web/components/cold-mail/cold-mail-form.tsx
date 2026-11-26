"use client";

import {
  COLD_MAIL_NAME_MAX_LENGTH,
  COLD_MAIL_NOTES_MAX_LENGTH,
  COLD_MAIL_ORGANISATION_MAX_LENGTH,
  COLD_MAIL_ROLE_MAX_LENGTH,
  COLD_MAIL_TARGET_TYPES,
  COLD_MAIL_TONES,
  type ColdMailTargetType,
  type ColdMailTone,
} from "@repo/shared/cold-mail";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { RadioGroup } from "@repo/ui/components/radio-group";
import { Select } from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { ApiError } from "@repo/web-core/api/errors";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { fieldErrors } from "@/lib/account/field-errors";
import { createColdMail } from "@/lib/api/cold-mail";
import { TARGET_TYPE_LABEL, TONE_LABEL } from "@/lib/cold-mail/format";
import { queryKeys, useCvs } from "@/lib/queries";

/** Who the email is for and how it should sound (`POST /v1/cold-mails`). */
export function ColdMailForm({ onCreated }: { onCreated: (id: string) => void }) {
  const cvs = useCvs();
  const queries = useQueryClient();
  const [cvId, setCvId] = useState<string>("");
  const [targetType, setTargetType] = useState<ColdMailTargetType>("professor");
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState<ColdMailTone>("formal");

  const available = cvs.data?.items ?? [];
  const chosenCv = available.some((cv) => cv.id === cvId)
    ? cvId
    : (available[0]?.id ?? "");

  const create = useMutation({
    mutationFn: () =>
      createColdMail({
        cvId: chosenCv,
        targetType,
        target: {
          name,
          organisation,
          ...(role.trim() ? { role } : {}),
          ...(notes.trim() ? { notes } : {}),
        },
        tone,
      }),
    onSuccess: ({ id }) => {
      void queries.invalidateQueries({ queryKey: queryKeys.coldMails });
      onCreated(id);
    },
  });

  const errors = create.isError ? fieldErrors(create.error) : {};
  const formError =
    create.isError && Object.keys(errors).length === 0
      ? create.error instanceof ApiError
        ? create.error.message
        : "Could not start the draft. Try again."
      : null;
  const ready = chosenCv !== "" && name.trim() !== "" && organisation.trim() !== "";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ready) create.mutate();
  }

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      {formError ? <Alert variant="destructive" title={formError} /> : null}
      <Field
        label="CV"
        error={errors.cvId}
        description={available.length === 0 ? "Upload a CV first." : undefined}
        required
      >
        <Select
          value={chosenCv}
          disabled={available.length === 0}
          onChange={(event) => setCvId(event.target.value)}
        >
          {available.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.filename}
            </option>
          ))}
        </Select>
      </Field>
      <RadioGroup
        legend="Writing to"
        options={COLD_MAIL_TARGET_TYPES.map((value) => ({
          value,
          label: TARGET_TYPE_LABEL[value],
        }))}
        value={targetType}
        onValueChange={(value) =>
          setTargetType(value === "company" ? "company" : "professor")
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={targetType === "professor" ? "Their name" : "Who to address"}
          error={errors["target.name"]}
          required
        >
          <Input
            value={name}
            maxLength={COLD_MAIL_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              targetType === "professor" ? "Dr. Ada Lovelace" : "The hiring team"
            }
          />
        </Field>
        <Field
          label={targetType === "professor" ? "University or lab" : "Company"}
          error={errors["target.organisation"]}
          required
        >
          <Input
            value={organisation}
            maxLength={COLD_MAIL_ORGANISATION_MAX_LENGTH}
            onChange={(event) => setOrganisation(event.target.value)}
          />
        </Field>
      </div>
      <Field
        label={
          targetType === "professor"
            ? "Their position (optional)"
            : "Role or team (optional)"
        }
        error={errors["target.role"]}
      >
        <Input
          value={role}
          maxLength={COLD_MAIL_ROLE_MAX_LENGTH}
          onChange={(event) => setRole(event.target.value)}
        />
      </Field>
      <Field
        label="Notes (optional)"
        description={`What you know about them or the role, and what you are asking for. ${notes.length} of ${COLD_MAIL_NOTES_MAX_LENGTH} characters.`}
        error={errors["target.notes"]}
      >
        <Textarea
          rows={4}
          value={notes}
          maxLength={COLD_MAIL_NOTES_MAX_LENGTH}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <RadioGroup
        legend="Tone"
        options={COLD_MAIL_TONES.map((value) => ({ value, label: TONE_LABEL[value] }))}
        value={tone}
        onValueChange={(value) => setTone(value === "friendly" ? "friendly" : "formal")}
      />
      <div>
        <Button type="submit" loading={create.isPending} disabled={!ready}>
          <Sparkles aria-hidden="true" />
          Write a draft
        </Button>
      </div>
    </form>
  );
}
