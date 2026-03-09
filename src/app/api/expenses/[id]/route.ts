import { createClient } from "@/lib/supabase/server";
import { updateExpenseSchema } from "@/lib/schemas/expense";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = updateExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const updates: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

  // Recompute amount_in_inr if financial fields change
  if (parsed.data.amount !== undefined || parsed.data.currency !== undefined || parsed.data.conversion_rate !== undefined) {
    const { data: existing } = await supabase
      .from("expenses")
      .select("amount, currency, conversion_rate")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      const amount = parsed.data.amount ?? existing.amount;
      const currency = parsed.data.currency ?? existing.currency;
      const conversion_rate = parsed.data.conversion_rate ?? existing.conversion_rate;
      const rate = currency === "INR" ? 1 : conversion_rate;
      updates.conversion_rate = rate;
      updates.amount_in_inr = Math.round(amount * rate * 100) / 100;
    }
  }

  // Auto-set paid_date when marking as paid
  if (parsed.data.is_paid === true && !parsed.data.paid_date) {
    updates.paid_date = new Date().toISOString().split("T")[0];
  }

  const { data, error } = await supabase
    .from("expenses")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
