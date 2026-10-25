import { enableRealDataOnlyAfterWipe } from "../realDataOnly";
import { deleteAvatarBlobDatabase } from "./avatarBlobCache";
import { clearClientCaches } from "./clearClientCaches";
import { destroyIfixedxDatabase } from "./ifixedxDb";
import { destroyTheFeedtrixDatabase } from "./thefeedtrixDb";

/**
 * Nukes both RxDB apps (iFixedX posts/seen + Pipetrix/TheFeedtrix DB `thefeedtrix_local`),
 * avatar blob IDB, and session/local mixer prefs (Grok rail snapshot, layout, landing skip, session clock).
 * Reload the page after running.
 */
export async function wipeAllLocalRxDatabases(): Promise<void> {
  if (typeof window === "undefined") return;
  clearClientCaches();
  enableRealDataOnlyAfterWipe();
  await deleteAvatarBlobDatabase();
  await destroyTheFeedtrixDatabase();
  await destroyIfixedxDatabase();
}
