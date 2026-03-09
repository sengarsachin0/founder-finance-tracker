import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/daily-revenue/entries/all — all entries for export (no pagination)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("daily_revenue_entries")
    .select("*, revenue_verticals(name)")
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
