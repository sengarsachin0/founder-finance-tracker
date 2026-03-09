import { createClient } from "@/lib/supabase/server";
import { updateRevenueEntrySchema } from "@/lib/schemas/revenue";
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
  const parsed = updateRevenueEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // If amount or currency/rate is being updated, recompute amount_in_inr
  const updates: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

  if (parsed.data.amount !== undefined || parsed.data.currency !== undefined || parsed.data.conversion_rate !== undefined) {
    // Fetch existing to fill in missing fields
    const { data: existing } = await supabase
      .from("revenue_entries")
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

  // Auto-set received_date when stage moves to "received"
  if (parsed.data.stage === "received" && !parsed.data.received_date) {
    updates.received_date = new Date().toISOString().split("T")[0];
  }

  const { data, error } = await supabase
    .from("revenue_entries")
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
    .from("revenue_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
