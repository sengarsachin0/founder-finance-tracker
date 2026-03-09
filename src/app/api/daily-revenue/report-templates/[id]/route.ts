import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { updateReportTemplateSchema } from "@/lib/schemas/daily-revenue";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = updateReportTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // If setting as default, clear other defaults for this vertical first
  if (parsed.data.is_default) {
    const { data: existing } = await supabase
      .from("revenue_report_templates")
      .select("vertical_id")
      .eq("id", id)
      .single();
    if (existing) {
      await supabase
        .from("revenue_report_templates")
        .update({ is_default: false })
        .eq("vertical_id", existing.vertical_id)
        .neq("id", id);
    }
  }

  const { data, error } = await supabase
    .from("revenue_report_templates")
    .update(parsed.data)
    .eq("id", id)
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
    .from("revenue_report_templates")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
