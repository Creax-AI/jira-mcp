import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/runtimes/worker/auth/schema.generated.ts"],
  out: "./migrations/drizzle",
  dialect: "sqlite",
  strict: true,
  verbose: true,
});
