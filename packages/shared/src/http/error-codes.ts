import { z } from "zod";
import { ERROR_CODES } from "../errors";

export { ERROR_CODES, ERROR_MESSAGES, ERROR_STATUS } from "../errors";
export type { ErrorCode, ErrorStatus } from "../errors";

export const errorCodeSchema = z.enum(ERROR_CODES);
