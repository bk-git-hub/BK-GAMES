import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { account, db, session, user, verification } from "@bk-games/db";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

const authBaseUrl =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

const authSecret = process.env.BETTER_AUTH_SECRET;

if (!authSecret) {
  throw new Error("BETTER_AUTH_SECRET is required.");
}

export const auth = betterAuth({
  appName: "BK Games",
  baseURL: authBaseUrl,
  basePath: "/api/auth",
  secret: authSecret,
  trustedOrigins: [authBaseUrl],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
