export const runtime = "nodejs";

import { NextResponse } from "next/server";

// Regex patterns to extract transactions from PDF text
// Matches: DD/MM/YYYY or DD-MM-YYYY or DD MMM YYYY at line start, followed by description and amount
const DATE_PATTERN = /(\d{2}[-/]\d{2}[-/]\d{2,4}|\d{2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i;

function extractTransactionsFromText(text: string): Array<{
  date: string;
  description: string;
  amount: number;
}> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const transactions: Array<{ date: string; description: string; amount: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(DATE_PATTERN);
    if (!dateMatch) continue;

    // Look for a debit/withdrawal amount — a number with commas, possibly decimal
    // Typically appears after the description on the same line or next line
    const amountMatches = (line + " " + (lines[i + 1] ?? "")).match(
      /(?:Dr|DR|Debit|debit|withdrawal|W\/D)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g
    );

    if (!amountMatches) continue;

    // Take the last numeric match on the line as the debit amount
    const rawAmounts = (line + " " + (lines[i + 1] ?? ""))
      .match(/\b(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\b/g) ?? [];

    if (rawAmounts.length < 2) continue; // Need at least amount + balance

    // Heuristic: second-to-last number is the transaction amount (last is closing balance)
    const amountStr = rawAmounts[rawAmounts.length - 2]?.replace(/,/g, "");
    const amount = parseFloat(amountStr ?? "0");

    if (!amount || amount <= 0) continue;

    // Extract description: everything between the date and the first amount
    const dateEnd = line.indexOf(dateMatch[0]) + dateMatch[0].length;
    const descRaw = line.slice(dateEnd).replace(/\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*/g, "").trim();
    const description = descRaw.slice(0, 80) || "Bank transaction";

    // Normalize date to YYYY-MM-DD
    let date = dateMatch[0];
    const parts = date.split(/[-/\s]+/);
    if (parts.length === 3) {
      const [d, m, y] = parts;
      const year = y.length === 2 ? `20${y}` : y;
      const monthNames: Record<string, string> = {
        jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
      };
      const month = isNaN(Number(m)) ? (monthNames[m.toLowerCase()] ?? "01") : m.padStart(2, "0");
      date = `${year}-${month}-${d.padStart(2, "0")}`;
    }

    transactions.push({ date, description, amount });
  }

  return transactions;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are accepted by this endpoint" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Dynamic import avoids pdf-parse reading test files at module load time
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    const transactions = extractTransactionsFromText(result.text);
    return NextResponse.json({ transactions, raw: result.text.slice(0, 500) });
  } catch (err) {
    console.error("PDF parse error:", err);
    return NextResponse.json({ error: "Failed to parse PDF" }, { status: 500 });
  }
}
