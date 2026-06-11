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
  to: string | string[];
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
 * and a human-readable expiry date. When `inviteUrl` is provided, a
 * "Set your password" call-to-action is added to both html and text — the
 * access-code display is always present regardless.
 */
export async function sendInviteEmail(
  to: string,
  code: string,
  groupName: string | null,
  expiresAt: string,
  inviteUrl?: string,
): Promise<void> {
  const expiryReadable = new Date(expiresAt).toUTCString();
  const groupLine = groupName ? `\nGroup / course: ${groupName}` : '';
  const groupHtml = groupName ? `<p><strong>Group / course:</strong> ${groupName}</p>` : '';

  const inviteUrlHtml = inviteUrl
    ? `<p><a href="${inviteUrl}" style="display:inline-block;padding:0.5em 1em;background:#000;color:#fff;text-decoration:none;border-radius:4px;">Set your password</a></p>`
    : '';
  const inviteUrlText = inviteUrl ? `\nSet your password: ${inviteUrl}` : '';

  const subject = "You're invited to TransformMyNotes";

  const html = `
<p>Hi,</p>
<p>You've been invited to <strong>TransformMyNotes</strong>. Use the code below to complete your sign-up:</p>
<p style="font-size:1.5em;letter-spacing:0.1em;font-weight:bold;">${code}</p>
${groupHtml}
${inviteUrlHtml}
<p><strong>Expires:</strong> ${expiryReadable}</p>
<p>If you weren't expecting this invite, you can safely ignore this message.</p>
<p>— The TransformMyNotes team</p>
`.trim();

  const text = [
    "You've been invited to TransformMyNotes.",
    '',
    `Access code: ${code}`,
    groupLine,
    inviteUrlText,
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
 * Sends a notification to admin(s) that a new access request has arrived.
 * If `adminEmails` is empty, returns immediately without sending.
 * The `reviewUrl` is optional — when provided it is included as a link.
 */
export async function sendAdminAccessRequestNotification(
  adminEmails: string[],
  request: { name: string; email: string; note?: string },
  reviewUrl?: string,
): Promise<void> {
  if (adminEmails.length === 0) return;

  const subject = 'New access request — TransformMyNotes';

  const noteHtml = request.note ? `<p><strong>Note:</strong> ${request.note}</p>` : '';
  const noteText = request.note ? `\nNote: ${request.note}` : '';
  const reviewUrlHtml = reviewUrl
    ? `<p><a href="${reviewUrl}">Review the request</a></p>`
    : '';
  const reviewUrlText = reviewUrl ? `\nReview: ${reviewUrl}` : '';

  const html = `
<p>A new access request has been submitted on <strong>TransformMyNotes</strong>.</p>
<p><strong>Name:</strong> ${request.name}</p>
<p><strong>Email:</strong> ${request.email}</p>
${noteHtml}
${reviewUrlHtml}
<p>— The TransformMyNotes system</p>
`.trim();

  const text = [
    'A new access request has been submitted on TransformMyNotes.',
    '',
    `Name: ${request.name}`,
    `Email: ${request.email}`,
    noteText,
    reviewUrlText,
    '',
    '— The TransformMyNotes system',
  ]
    .join('\n')
    .trim();

  await sendEmail({ from: fromAddress(), to: adminEmails, subject, html, text });
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
