import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const upsertSchema = z.object({
  ledger_name: z.string().min(1),
  category: z.string().min(1),
});

// GET all mappings for the authenticated user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("tally_ledger_mappings")
    .select("*")
    .eq("user_id", user.id)
    .order("ledger_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST upsert a single mapping (or array for bulk)
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // Accept either a single object or an array
  const items = Array.isArray(body) ? body : [body];
  const parsed = z.array(upsertSchema).safeParse(items);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const rows = parsed.data.map((m) => ({
    user_id: user.id,
    ledger_name: m.ledger_name,
    category: m.category,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("tally_ledger_mappings")
    .upsert(rows, { onConflict: "user_id,ledger_name" })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 200 });
}
