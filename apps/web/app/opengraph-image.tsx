import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt =
  "IQ.wiki Value Created Index — Provisional Value Created for Others";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "flex-start",
        background: "#FFFFFF",
        border: "24px solid #F3F4F6",
        color: "#0F172A",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px",
        width: "100%",
      }}
    >
      <div style={{ color: "#FF5CAA", fontSize: 30, letterSpacing: 4 }}>
        IQ.WIKI VALUE CREATED INDEX
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 82, letterSpacing: -4 }}>Crypto Founders</div>
        <div style={{ color: "#526074", fontSize: 40 }}>
          Provisional value created for others · Calculations and sources
        </div>
      </div>
      <div style={{ color: "#0F172A", fontSize: 26 }}>
        Time-stamped · Evidence-backed · Unknown is never zero
      </div>
    </div>,
    size,
  );
}
