import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../../lib/auth";
import {
  deleteTransaction,
  DuplicateTransactionError,
  updateTransaction,
  type TransactionInput,
} from "../../../../lib/database";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const { id } = await context.params;
    await updateTransaction(user.id, id, (await request.json()) as TransactionInput);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update transaction",
        duplicateId: error instanceof DuplicateTransactionError ? error.duplicateId : undefined,
      },
      { status: error instanceof DuplicateTransactionError ? 409 : 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const { id } = await context.params;
    await deleteTransaction(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete transaction" },
      { status: 400 },
    );
  }
}
