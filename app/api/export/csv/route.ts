import { requireSession } from "../../../../lib/auth";
import { exportTransactionsCsv } from "../../../../lib/import-export";

export async function GET() {
  const user = await requireSession();
  return new Response(await exportTransactionsCsv(user.id), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="alpha-lab-ledger.csv"',
      "cache-control": "no-store",
    },
  });
}
