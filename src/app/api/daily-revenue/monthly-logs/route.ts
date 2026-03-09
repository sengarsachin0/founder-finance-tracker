import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/daily-revenue/monthly-logs?vertical_id=&year=
// Returns monthly performance snapshots for a vertical (or all verticals if omitted).
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const vertical_id = searchParams.get("vertical_id");
  const year = searchParams.get("year");

  let query = supabase
    .from("revenue_monthly_logs")
    .select("*, revenue_verticals(name, color)")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  if (vertical_id) query = query.eq("vertical_id", vertical_id);
  if (year) query = query.eq("year", Number(year));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
