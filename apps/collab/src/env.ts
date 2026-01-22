import { z } from "zod";

const envSchema = z.object({
  COLLAB_PORT: z.coerce.number().int().positive().default(8787),
  COLLAB_TOKEN_SECRET: z.string().min(1).optional(),
});

const parsed = envSchema.parse(process.env);

const tokenSecret =
  parsed.COLLAB_TOKEN_SECRET ??
  (process.env.NODE_ENV === "production" ? null : "dev-secret");

if (!tokenSecret) {
  throw new Error("COLLAB_TOKEN_SECRET is required in production");
}

if (!parsed.COLLAB_TOKEN_SECRET && process.env.NODE_ENV !== "production") {
  console.warn("COLLAB_TOKEN_SECRET not set; using dev-secret");
}

export const env = {
  port: parsed.COLLAB_PORT,
  tokenSecret,
};
