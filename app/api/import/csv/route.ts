import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../../lib/auth";
import { importTransactionsCsv } from "../../../../lib/import-export";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 2_000_000) {
      throw new Error("Choose a CSV file smaller than 2 MB");
    }
    const result = await importTransactionsCsv(
      user.id,
      await file.text(),
      file.name,
      form.get("replaceDemo") === "true",
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 400 },
    );
  }
}
