import { createClient } from "@/lib/supabase/server";
import { bankAccountSchema } from "@/lib/schemas/bank-account";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = bankAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { balance, conversion_rate, currency } = parsed.data;
  // Server always calculates balance_in_inr — client value is ignored
  const rate = currency === "INR" ? 1 : (conversion_rate ?? 1);
  const balance_in_inr = Math.round(balance * rate * 100) / 100;

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({ ...parsed.data, conversion_rate: rate, balance_in_inr, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
