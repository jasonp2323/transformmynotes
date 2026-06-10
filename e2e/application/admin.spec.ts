/**
 * Admin panel + invite flow E2E tests.
 *
 * Runs against the same offline stack as auth.spec.ts:
 * dynalite + cognito-local + next dev — all booted by global-setup.ts.
 *
 * Prerequisites seeded by global-setup:
 *  - Admin user   (e2e-admin@example.com, in cognito 'admin' group, active DDB profile)
 *  - pendingUser1 (has groupIds → 'Invited' badge)
 *  - pendingUser2 (no groupIds → 'No invite code' badge)
 *  - revokableInvite (code invite, label 'E2E-REVOKE-ME', status 'pending')
 *
 * Tests:
 *  1. Admin sign-in → pending queue (visible, admin nav group present)
 *  2. Approve a pending user → toast + row disappears + approved user can sign in
 *  3. Members page renders with admin's own "(you)" row
 *  4. Create email invite → toast with code
 *  5. Create shareable code invite → toast with code + row appears
 *  6. Revoke a seeded invite → status badge flips to 'Revoked'
 *  7. Non-admin hitting /admin/pending → redirected to /dashboard?forbidden=1
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readRuntime, installSrpBypass } from './helpers';

const SCREENSHOTS_DIR = path.join(__dirname, '../../docs/verification/m3-admin');

// ── 1. Admin sign-in → pending queue ────────────────────────────────────────

test('admin sign-in sees pending queue and admin nav', async ({ page }) => {
  const runtime = readRuntime();

  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.adminUsername.toLowerCase()]: runtime.adminPassword,
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.adminUsername);
  await page.getByLabel('Password').first().fill(runtime.adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  // Navigate to pending queue
  await page.goto('/admin/pending');
  await expect(page).toHaveURL(/\/admin\/pending/, { timeout: 15_000 });

  // h1 is rendered as the shell title (text inside .tmn-shell__title)
  await expect(page.locator('h1')).toContainText('Pending registrations', { timeout: 10_000 });

  // Both pending users should be visible by email
  // Use .first() to resolve strict-mode: the email appears in both the inner <span>
  // (name cell) and the surrounding card div text (which includes "· requested...").
  await expect(page.getByText(runtime.pendingUser1.email).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(runtime.pendingUser2.email).first()).toBeVisible({ timeout: 10_000 });

  // Admin nav group is present — look for the group label "Admin" in the sidebar
  await expect(page.locator('.tmn-sidebar__group-label', { hasText: 'Admin' })).toBeVisible();

  // Pending and Members and Invites links in the admin nav
  await expect(page.locator('nav').getByRole('link', { name: 'Pending' })).toBeVisible();
  await expect(page.locator('nav').getByRole('link', { name: 'Members' })).toBeVisible();
  await expect(page.locator('nav').getByRole('link', { name: 'Invites' })).toBeVisible();

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'admin-pending-queue.png'),
    fullPage: true,
  });
});

// ── 2. Approve a pending user ────────────────────────────────────────────────

test('approve pending user → toast + row gone + user can sign in', async ({ page, browser }) => {
  const runtime = readRuntime();

  // Sign in as admin
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.adminUsername.toLowerCase()]: runtime.adminPassword,
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.adminUsername);
  await page.getByLabel('Password').first().fill(runtime.adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.goto('/admin/pending');

  // Wait for pending user rows to load
  await expect(page.getByText(runtime.pendingUser1.email).first()).toBeVisible({ timeout: 10_000 });

  // Find the card containing pendingUser1's email and click its Approve button.
  // The pending page renders each user as a <Card padded> which renders as a div
  // with class tmn-card. We filter by the card that contains the user's email,
  // then click the Approve button within it.
  const approveButton = page.locator('.tmn-card').filter({
    hasText: runtime.pendingUser1.email,
  }).first().getByRole('button', { name: 'Approve' });
  await approveButton.click();

  // Wait for the success toast — title is "<firstName> approved" where firstName is
  // derived from the name/email. Since name is set to the email, firstName = email part.
  // The toast title format is: `${fname} approved` where fname = email (our seed sets name=email)
  // so the firstName will be the full email since it has no space (split on space gives [email]).
  await expect(page.getByText(/approved/i)).toBeVisible({ timeout: 15_000 });

  // The row for pendingUser1 should disappear (optimistic remove)
  await expect(page.getByText(runtime.pendingUser1.email)).not.toBeVisible({ timeout: 10_000 });

  // ── Verify approved user can now sign in ────────────────────────────────────
  // Note on RISK #1: The approve route calls AdminAddUserToGroup({Username: sub}).
  // cognito-local's getUserByUsername first tries exact match on stored username
  // then falls back to matching the 'sub' attribute. Since sub differs from the
  // email username, cognito-local iterates all users and matches by sub attribute.
  // This is confirmed to work (see the cognito-local adminAddUserToGroup.js source).
  //
  // Open a FRESH BROWSER CONTEXT (not page in same context) so that the admin's
  // CognitoIdToken cookie is NOT present — we need a clean session to sign in
  // as pendingUser1. (context.newPage() inherits cookies from the existing context.)
  const freshCtx = await browser.newContext({ baseURL: 'http://localhost:3002' });
  const freshPage = await freshCtx.newPage();

  await installSrpBypass(freshPage, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.pendingUser1.email.toLowerCase()]: runtime.pendingUser1.password,
  });

  await freshPage.goto('/login');
  await freshPage.getByLabel('Email').fill(runtime.pendingUser1.email);
  await freshPage.getByLabel('Password').first().fill(runtime.pendingUser1.password);
  await freshPage.getByRole('button', { name: 'Sign in' }).click();

  // Approved user should reach /dashboard (not /pending or /login)
  await expect(freshPage).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await freshCtx.close();
});

// ── 3. Members page renders ──────────────────────────────────────────────────

test('members page shows table with admin (you) row', async ({ page }) => {
  const runtime = readRuntime();

  // Sign in as admin
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.adminUsername.toLowerCase()]: runtime.adminPassword,
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.adminUsername);
  await page.getByLabel('Password').first().fill(runtime.adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.goto('/admin/members');
  await expect(page).toHaveURL(/\/admin\/members/, { timeout: 10_000 });

  // h1 "Members"
  await expect(page.locator('h1')).toContainText('Members', { timeout: 10_000 });

  // The admin's own row should show "(you)"
  await expect(page.getByText('(you)')).toBeVisible({ timeout: 15_000 });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'admin-members.png'),
    fullPage: true,
  });
});

// ── 4. Create email invite ───────────────────────────────────────────────────

test('create email invite shows toast with code', async ({ page }) => {
  const runtime = readRuntime();

  // Sign in as admin
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.adminUsername.toLowerCase()]: runtime.adminPassword,
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.adminUsername);
  await page.getByLabel('Password').first().fill(runtime.adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.goto('/admin/invites');
  await expect(page.locator('h1')).toContainText('Invites', { timeout: 10_000 });

  // Ensure Email invite mode is active (it is the default)
  // The SegmentedControl has "Email invite" and "Shareable code" options.
  // "Email invite" is selected by default, so the Recipient email input should be present.
  const recipientInput = page.getByLabel('Recipient email');
  await expect(recipientInput).toBeVisible({ timeout: 5_000 });

  const newEmail = `e2e-invited-${Date.now()}@example.com`;
  await recipientInput.fill(newEmail);

  await page.getByRole('button', { name: 'Send invite' }).click();

  // Toast should appear with "Code:" in the body (route returns codeDisplay even offline)
  // The toast is fixed-positioned at bottom-right and contains the body text.
  // Even when email is offline (emailSent:false), the body contains "Code: XXXX-XXXX"
  await expect(page.getByText(/Code:/)).toBeVisible({ timeout: 15_000 });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'admin-invite-email-toast.png'),
    fullPage: true,
  });
});

// ── 5. Create shareable code invite ─────────────────────────────────────────

test('create shareable code invite shows toast with code and row appears', async ({ page }) => {
  const runtime = readRuntime();

  // Sign in as admin
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.adminUsername.toLowerCase()]: runtime.adminPassword,
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.adminUsername);
  await page.getByLabel('Password').first().fill(runtime.adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.goto('/admin/invites');
  await expect(page.locator('h1')).toContainText('Invites', { timeout: 10_000 });

  // Switch to "Shareable code" mode via the SegmentedControl
  await page.getByRole('button', { name: 'Shareable code' }).click();

  // Code label input should now be visible
  const codeLabelInput = page.getByLabel('Code label');
  await expect(codeLabelInput).toBeVisible({ timeout: 5_000 });

  const uniqueLabel = `E2E-CODE-${Date.now()}`;
  await codeLabelInput.fill(uniqueLabel);

  // Max uses input
  const maxUsesInput = page.getByLabel('Max uses');
  await maxUsesInput.fill('10');

  await page.getByRole('button', { name: 'Create code' }).click();

  // Toast with "Code:" in body
  await expect(page.getByText(/Code:/)).toBeVisible({ timeout: 15_000 });

  // After dismissal/timeout the invite list refreshes and the new row should appear
  // with the label as the recipient column value.
  // Wait for the row with the unique label to appear in the table.
  await expect(page.getByText(uniqueLabel)).toBeVisible({ timeout: 15_000 });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'admin-invite-code-toast.png'),
    fullPage: true,
  });
});

// ── 6. Revoke a seeded invite ────────────────────────────────────────────────

test('revoke seeded invite → status badge flips to Revoked', async ({ page }) => {
  const runtime = readRuntime();

  // Sign in as admin
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.adminUsername.toLowerCase()]: runtime.adminPassword,
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.adminUsername);
  await page.getByLabel('Password').first().fill(runtime.adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.goto('/admin/invites');
  await expect(page.locator('h1')).toContainText('Invites', { timeout: 10_000 });

  // Wait for the invites list to load — the seeded revokable invite should be present.
  // The invite page renders a status filter SegmentedControl and a table card.
  // Our revokable invite is a 'code' type, so inviteRecipientLabel returns its label.
  await expect(page.getByText(runtime.revokableInvite.label)).toBeVisible({ timeout: 15_000 });

  // Find the table card (second .tmn-card: the first is the create-invite form).
  // Within it, find the innermost row div that has both our label text AND a Revoke button.
  // Using filter chains: locator('div').filter(hasText).filter(has Revoke).last() gives
  // the innermost ancestor that matches both — the row div itself.
  const tableCard = page.locator('.tmn-card').filter({
    hasText: runtime.revokableInvite.label,
  }).filter({
    has: page.getByRole('button', { name: 'Revoke' }),
  }).first();

  const revokeBtnInRow = tableCard.locator('div').filter({
    hasText: runtime.revokableInvite.label,
  }).filter({
    has: page.getByRole('button', { name: 'Revoke' }),
  }).last()
    .getByRole('button', { name: 'Revoke' }).first();

  await revokeBtnInRow.click();

  // After the optimistic update the row's status badge changes to "Revoked".
  // The row stays visible (revoked invites remain displayed); only the status changes.
  // Assert that the label is still visible and the badge text "Revoked" appears in
  // the table card (the badge is rendered by Badge component with text statusLabel(status)).
  await expect(tableCard.getByText(runtime.revokableInvite.label)).toBeVisible({ timeout: 10_000 });
  await expect(tableCard.getByText('Revoked').first()).toBeVisible({ timeout: 10_000 });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'admin-invite-revoked.png'),
    fullPage: true,
  });
});

// ── 7. Non-admin is blocked from /admin/** ───────────────────────────────────

test('non-admin hitting /admin/pending is redirected to /dashboard?forbidden=1', async ({ page }) => {
  const runtime = readRuntime();

  // Sign in as the regular (member) test user — not in the admin group
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.username.toLowerCase()]: runtime.password,
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.username);
  await page.getByLabel('Password').first().fill(runtime.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  // Now navigate to an admin route — proxy.ts should redirect to /dashboard?forbidden=1
  await page.goto('/admin/pending');

  // Expect redirect to /dashboard with forbidden=1 query param
  await expect(page).toHaveURL(/\/dashboard\?forbidden=1/, { timeout: 15_000 });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'admin-forbidden-redirect.png'),
    fullPage: true,
  });
});
