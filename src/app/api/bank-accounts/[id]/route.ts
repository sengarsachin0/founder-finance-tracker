import { createClient } from "@/lib/supabase/server";
import { updateBalanceSchema } from "@/lib/schemas/bank-account";
import { NextResponse } from "next/server";

// PATCH /api/bank-accounts/[id] — update balance (and optional notes)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = updateBalanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // Fetch existing account to get currency
  const { data: existing, error: fetchError } = await supabase
    .from("bank_accounts")
    .select("currency")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { balance, conversion_rate, notes } = parsed.data;
  const rate = existing.currency === "INR" ? 1 : (conversion_rate ?? 1);
  const balance_in_inr = Math.round(balance * rate * 100) / 100;

  const { data, error } = await supabase
    .from("bank_accounts")
    .update({ balance, conversion_rate: rate, balance_in_inr, notes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// DELETE /api/bank-accounts/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("bank_accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
