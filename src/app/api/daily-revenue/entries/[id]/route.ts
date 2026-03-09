import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { updateDailyEntrySchema } from "@/lib/schemas/daily-revenue";
import { upsertMonthlyLog } from "@/lib/server/monthly-log";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = updateDailyEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // Fetch existing entry to know vertical_id + date for log upsert
  const { data: existing } = await supabase
    .from("daily_revenue_entries")
    .select("vertical_id, date")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("daily_revenue_entries")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing) {
    const d = new Date(existing.date);
    upsertMonthlyLog(supabase, existing.vertical_id, d.getMonth() + 1, d.getFullYear()).catch(() => {});
  }

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

  // Fetch before deleting so we can update the monthly log
  const { data: existing } = await supabase
    .from("daily_revenue_entries")
    .select("vertical_id, date")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("daily_revenue_entries")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing) {
    const d = new Date(existing.date);
    upsertMonthlyLog(supabase, existing.vertical_id, d.getMonth() + 1, d.getFullYear()).catch(() => {});
  }

  return new NextResponse(null, { status: 204 });
}
