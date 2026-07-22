import { AppShell } from "@/components/shell/AppShell";
import { requireProfile } from "@/lib/auth/session";
import { getAutomationHealth } from "@/lib/db/automations";

/**
 * The authenticated shell. Everything under (app) requires a session.
 *
 * requireProfile() is belt-and-braces: middleware already redirects anonymous
 * requests, but a deactivated user holding a live JWT would sail past the
 * middleware's getUser() check — their profile is what says they're revoked
 * (§3.22). Cheap, thanks to React cache().
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  // The red dot in the nav. One query per page rather than one per nav item,
  // and it fails soft: a broken health check must never take the whole shell
  // down with it.
  let errorCount = 0;
  try {
    errorCount = (await getAutomationHealth()).total;
  } catch {
    errorCount = 0;
  }

  return (
    <AppShell profile={profile} errorCount={errorCount}>
      {children}
    </AppShell>
  );
}
