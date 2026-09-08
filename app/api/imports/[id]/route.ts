import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../../lib/auth";
import { deleteImportBatch } from "../../../../lib/import-export";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const { id } = await context.params;
    await deleteImportBatch(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete import batch" },
      { status: 400 },
    );
  }
}
