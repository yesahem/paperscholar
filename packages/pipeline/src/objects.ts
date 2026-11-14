import type { ObjectStorage } from "@repo/storage";
import type { z } from "zod";

const JSON_TYPE = "application/json";

/** Reads and validates a JSON object; null when the key does not exist. */
export async function readJson<Schema extends z.ZodType>(
  storage: ObjectStorage,
  key: string,
  schema: Schema,
): Promise<z.output<Schema> | null> {
  const object = await storage.get(key);
  if (!object) return null;
  const parsed = schema.safeParse(JSON.parse(new TextDecoder().decode(object.body)));
  if (!parsed.success) throw new Error(`${key} is malformed: ${parsed.error.message}`);
  return parsed.data;
}

/** Like `readJson`, for objects an earlier stage must have written. */
export async function requireJson<Schema extends z.ZodType>(
  storage: ObjectStorage,
  key: string,
  schema: Schema,
): Promise<z.output<Schema>> {
  const value = await readJson(storage, key, schema);
  if (value === null) throw new Error(`${key} is missing`);
  return value;
}

/** Writes a JSON object, replacing any earlier one: reruns overwrite rather than duplicate. */
export async function writeJson(
  storage: ObjectStorage,
  key: string,
  value: unknown,
): Promise<void> {
  await storage.put(key, JSON.stringify(value, null, 2), { contentType: JSON_TYPE });
}
