import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../lib/auth";
import {
  DuplicateTransactionError,
  insertTransaction,
  type TransactionInput,
} from "../../../lib/database";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const id = await insertTransaction(user.id, (await request.json()) as TransactionInput);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save transaction",
        duplicateId: error instanceof DuplicateTransactionError ? error.duplicateId : undefined,
      },
      { status: error instanceof DuplicateTransactionError ? 409 : 400 },
    );
  }
}
