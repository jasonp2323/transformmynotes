/**
 * Server-side Cloudflare Turnstile verification helper.
 * Call `verifyTurnstile(token)` inside a Route Handler or Server Action to
 * confirm the widget challenge was solved before processing the request.
 * Throws `TurnstileError` on verification failure; throws `Error` when the
 * required secret is not configured.
 */

/** Thrown when Cloudflare Turnstile reports that verification did not succeed. */
export class TurnstileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnstileError";
  }
}

/**
 * Cloudflare's documented always-pass test secret key.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 * When this secret is configured (non-production / CI stages), verification
 * short-circuits and resolves immediately without making a network call to
 * challenges.cloudflare.com. This only matches this exact test secret — real
 * production keys never match and always go through the live API.
 */
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

/**
 * Verifies a Turnstile challenge token against Cloudflare's siteverify API.
 * Reads `TURNSTILE_SECRET_KEY` from the server environment — fails loudly if
 * the secret is not set.
 *
 * When `TURNSTILE_SECRET_KEY` is set to Cloudflare's always-pass test secret
 * (`TURNSTILE_TEST_SECRET`), resolves immediately without calling fetch.
 * This allows E2E / offline CI runs to bypass the live Cloudflare network call.
 *
 * @param token - The `cf-turnstile-response` value submitted by the client.
 * @throws {Error} If `TURNSTILE_SECRET_KEY` is not configured.
 * @throws {TurnstileError} If Cloudflare reports that verification failed.
 */
export async function verifyTurnstile(token: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not set");
  }

  // Short-circuit: Cloudflare's always-pass test secret never needs a network
  // call — it is only used in non-production / CI stages where the live
  // challenges.cloudflare.com endpoint is not reachable.
  if (secret === TURNSTILE_TEST_SECRET) {
    return;
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    },
  );

  const data = (await response.json()) as { success: boolean };
  if (!data.success) {
    throw new TurnstileError("Turnstile verification failed");
  }
}
