export type FeeStatus = "PROVISIONAL" | "CONFIRMED" | "STATEMENT";
const marker = /\[alpha-fees:(PROVISIONAL|CONFIRMED|STATEMENT)\]/g;

// Keep metadata in the existing audited note field: backups, CSV and undo retain it.
export function feeStatus(transaction: { note?: string | null; source?: string }): FeeStatus {
  const matches = [...(transaction.note ?? "").matchAll(marker)];
  if (matches.length) return matches.at(-1)![1] as FeeStatus;
  return /^HSBC investment statement/i.test(transaction.source ?? "") ? "STATEMENT" : "PROVISIONAL";
}
export function visibleNote(note: string | null | undefined) {
  return (note ?? "").replace(marker, "").trim();
}
export function withFeeStatus(note: string | null | undefined, status: FeeStatus) {
  if (!["PROVISIONAL", "CONFIRMED", "STATEMENT"].includes(status)) throw new Error("费用核对状态无效");
  return `${visibleNote(note)}\n[alpha-fees:${status}]`.trim();
}
export const feeStatusLabels: Record<FeeStatus, string> = {
  PROVISIONAL: "待月结单", CONFIRMED: "费用已确认", STATEMENT: "结单已核对",
};
