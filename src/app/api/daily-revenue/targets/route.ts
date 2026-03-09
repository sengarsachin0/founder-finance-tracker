import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { targetSchema } from "@/lib/schemas/daily-revenue";

// GET /api/daily-revenue/targets?vertical_id=&month=&year=
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const vertical_id = searchParams.get("vertical_id");
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  if (!vertical_id) {
    return NextResponse.json({ error: "vertical_id is required" }, { status: 400 });
  }

  let query = supabase.from("monthly_revenue_targets").select("*").eq("vertical_id", vertical_id);
  if (month) query = query.eq("month", Number(month));
  if (year) query = query.eq("year", Number(year));
  query = query.order("year", { ascending: false }).order("month", { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST — upsert (insert or update) target for a vertical+month+year
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = targetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("monthly_revenue_targets")
    .upsert(
      { ...parsed.data, set_by: user.id },
      { onConflict: "vertical_id,month,year" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 200 });
}
