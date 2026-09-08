import { ensureGuestDemoData, loadLabData } from "../lib/database";
import { getSessionUser } from "../lib/auth";
import { AlphaLab } from "./alpha-lab";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/api/guest/start");
  if (user.isGuest) await ensureGuestDemoData(user.id);
  return <AlphaLab
    initialData={await loadLabData(user.id)}
    displayName={user.displayName}
    isGuest={user.isGuest}
  />;
}
