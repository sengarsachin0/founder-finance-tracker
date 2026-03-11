import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: sizeStr } = await params;
  const size = sizeStr === "512" ? 512 : 192;
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.52);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: "#4f46e5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        F
      </div>
    ),
    { width: size, height: size }
  );
}
