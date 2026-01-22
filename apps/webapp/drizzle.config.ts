import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../packages/kontexted-db/src/schema/*.ts"
);

export default defineConfig({
  schema: schemaPath,
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
