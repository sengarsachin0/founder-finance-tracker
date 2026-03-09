import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { reportTemplateSchema } from "@/lib/schemas/daily-revenue";

// GET /api/daily-revenue/report-templates?vertical_id=
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const vertical_id = searchParams.get("vertical_id");
  if (!vertical_id) {
    return NextResponse.json({ error: "vertical_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("revenue_report_templates")
    .select("*")
    .eq("vertical_id", vertical_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = reportTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // If setting this template as default, clear existing defaults for this vertical
  if (parsed.data.is_default) {
    await supabase
      .from("revenue_report_templates")
      .update({ is_default: false })
      .eq("vertical_id", parsed.data.vertical_id);
  }

  const { data, error } = await supabase
    .from("revenue_report_templates")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
