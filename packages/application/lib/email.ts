/**
 * Transactional email helpers — thin wrappers around the Resend SDK.
 *
 * Config is read lazily at call time (process.env) so unit tests can set/unset
 * env vars per-test without module-level caching issues. A missing/empty env
 * var throws loudly — no silent fallbacks.
 */
import { Resend } from 'resend';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Throws a clear error if `name` is not set in the environment. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. ` +
        `Ensure it is seeded in the SST Console (production and fallback environments).`,
    );
  }
  return value;
}

/** Builds a fresh Resend client using the API key from the environment. */
function buildResend(): Resend {
  return new Resend(requireEnv('RESEND_API_KEY'));
}

/** Returns the "from" address for transactional email. */
function fromAddress(): string {
  return requireEnv('INVITE_FROM_ADDRESS');
}

/** Sends an email and throws if Resend returns an error. */
async function sendEmail(payload: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const resend = buildResend();
  const { error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Sends an invite email containing the access code, optional group/course name,
 * and a human-readable expiry date.
 */
export async function sendInviteEmail(
  to: string,
  code: string,
  groupName: string | null,
  expiresAt: string,
): Promise<void> {
  const expiryReadable = new Date(expiresAt).toUTCString();
  const groupLine = groupName ? `\nGroup / course: ${groupName}` : '';
  const groupHtml = groupName ? `<p><strong>Group / course:</strong> ${groupName}</p>` : '';

  const subject = "You're invited to TransformMyNotes";

  const html = `
<p>Hi,</p>
<p>You've been invited to <strong>TransformMyNotes</strong>. Use the code below to complete your sign-up:</p>
<p style="font-size:1.5em;letter-spacing:0.1em;font-weight:bold;">${code}</p>
${groupHtml}
<p><strong>Expires:</strong> ${expiryReadable}</p>
<p>If you weren't expecting this invite, you can safely ignore this message.</p>
<p>— The TransformMyNotes team</p>
`.trim();

  const text = [
    "You've been invited to TransformMyNotes.",
    '',
    `Access code: ${code}`,
    groupLine,
    `Expires: ${expiryReadable}`,
    '',
    "If you weren't expecting this invite, you can safely ignore this message.",
    '',
    '— The TransformMyNotes team',
  ]
    .join('\n')
    .trim();

  await sendEmail({ from: fromAddress(), to, subject, html, text });
}

/**
 * Sends an approval email welcoming the user by name.
 */
export async function sendApprovalEmail(to: string, name: string): Promise<void> {
  const subject = 'Your TransformMyNotes access is ready';

  const html = `
<p>Hi ${name},</p>
<p>Great news — your request to join <strong>TransformMyNotes</strong> has been approved. You're all set!</p>
<p>Sign in at any time to get started with your notes.</p>
<p>— The TransformMyNotes team</p>
`.trim();

  const text = [
    `Hi ${name},`,
    '',
    "Great news — your request to join TransformMyNotes has been approved. You're all set!",
    '',
    'Sign in at any time to get started with your notes.',
    '',
    '— The TransformMyNotes team',
  ].join('\n');

  await sendEmail({ from: fromAddress(), to, subject, html, text });
}

/**
 * Sends a rejection email — calm and non-judgmental.
 */
export async function sendRejectionEmail(to: string): Promise<void> {
  const subject = 'Update on your TransformMyNotes request';

  const html = `
<p>Hi,</p>
<p>Thanks for your interest in <strong>TransformMyNotes</strong>. Unfortunately, we weren't able to approve your request at this time.</p>
<p>If you think this is a mistake or have any questions, feel free to reach out.</p>
<p>— The TransformMyNotes team</p>
`.trim();

  const text = [
    'Hi,',
    '',
    "Thanks for your interest in TransformMyNotes. Unfortunately, we weren't able to approve your request at this time.",
    '',
    'If you think this is a mistake or have any questions, feel free to reach out.',
    '',
    '— The TransformMyNotes team',
  ].join('\n');

  await sendEmail({ from: fromAddress(), to, subject, html, text });
}
