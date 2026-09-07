import { loadLabData } from "../lib/database";
import { AlphaLab } from "./alpha-lab";
import { requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <AlphaLab initialData={await loadLabData(user.id)} displayName={user.displayName} />;
}
