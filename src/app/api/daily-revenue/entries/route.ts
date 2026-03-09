import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { dailyEntrySchema } from "@/lib/schemas/daily-revenue";
import { upsertMonthlyLog } from "@/lib/server/monthly-log";

// GET /api/daily-revenue/entries?vertical_id=&month=&year=
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const vertical_id = searchParams.get("vertical_id");
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  if (!vertical_id || !month || !year) {
    return NextResponse.json({ error: "vertical_id, month, year are required" }, { status: 400 });
  }

  const m = String(Number(month)).padStart(2, "0");
  const startDate = `${year}-${m}-01`;
  const endDate = new Date(Number(year), Number(month), 0).toISOString().slice(0, 10); // last day of month

  const { data, error } = await supabase
    .from("daily_revenue_entries")
    .select("*")
    .eq("vertical_id", vertical_id)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = dailyEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("daily_revenue_entries")
    .insert({ ...parsed.data, entered_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update monthly snapshot (fire-and-forget — don't block response)
  const entryDate = new Date(parsed.data.date);
  upsertMonthlyLog(supabase, parsed.data.vertical_id, entryDate.getMonth() + 1, entryDate.getFullYear()).catch(() => {});

  return NextResponse.json(data, { status: 201 });
}
