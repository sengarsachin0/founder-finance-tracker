import { createClient } from "@/lib/supabase/server";
import { revenueEntrySchema } from "@/lib/schemas/revenue";
import { NextResponse } from "next/server";

// GET /api/revenue?vertical_id=&include_archived=true
export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const vertical_id = searchParams.get("vertical_id");
  const include_archived = searchParams.get("include_archived") === "true";

  let query = supabase
    .from("revenue_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!include_archived) query = query.eq("archived", false);
  if (vertical_id) query = query.eq("vertical_id", vertical_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = revenueEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { amount, currency, conversion_rate } = parsed.data;
  const rate = currency === "INR" ? 1 : (conversion_rate ?? 1);
  const amount_in_inr = Math.round(amount * rate * 100) / 100;

  const { data, error } = await supabase
    .from("revenue_entries")
    .insert({ ...parsed.data, conversion_rate: rate, amount_in_inr, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
