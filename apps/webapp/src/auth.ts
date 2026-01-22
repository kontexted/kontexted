import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, keycloak, mcp } from "better-auth/plugins";
import { db } from "@/db";
import {
  accounts,
  oauthAccessTokens,
  oauthApplications,
  oauthConsents,
  sessions,
  users,
  verifications,
} from "@kontexted/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      account: accounts,
      session: sessions,
      verification: verifications,
      oauthApplication: oauthApplications,
      oauthAccessToken: oauthAccessTokens,
      oauthConsent: oauthConsents,
    },
  }),
  plugins: [
    genericOAuth({
      config: [
        keycloak({
          clientId: process.env.AUTH_KEYCLOAK_ID || "",
          clientSecret: process.env.AUTH_KEYCLOAK_SECRET || "",
          issuer: process.env.AUTH_KEYCLOAK_ISSUER || "",
        }),
      ],
    }),
    mcp({
      loginPage: "/",
    }),
    nextCookies(),
  ],
});
