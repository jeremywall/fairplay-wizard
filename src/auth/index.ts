import { betterAuth } from "better-auth";

/** Google sign-in is offered only when both Google OAuth secrets are set. */
export function googleEnabled(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

// Bindings are only available per request on Workers, so an auth instance is
// created for each request.
export function createAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true },
    socialProviders: googleEnabled(env)
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {},
    // Google verifies email addresses, so signing in with Google links to an
    // existing email/password account with the same address.
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  });
}

export type Auth = ReturnType<typeof createAuth>;
