import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "Top Crypto Founders Ranked by Value Created for Others.";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "flex-start",
        background: "#07100e",
        color: "#f4f2e9",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px",
        width: "100%",
      }}
    >
      <div style={{ color: "#79e7ae", fontSize: 30, letterSpacing: 4 }}>
        PROVISIONAL VALUE CREATED FOR OUTSIDE HOLDERS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 82, letterSpacing: -4 }}>Crypto Founders</div>
        <div style={{ color: "#9eaaa4", fontSize: 40 }}>
          Index · Transparent calculations and sources
        </div>
      </div>
      <div style={{ color: "#f2b86b", fontSize: 26 }}>
        Evidence-backed · Unknown is never zero
      </div>
    </div>,
    size,
  );
}
