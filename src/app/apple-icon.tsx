import { ImageResponse } from "next/og";
import { LOGO_VIEW_BOX, logoShapes } from "@/components/layout/logo-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
        }}
      >
        <svg width="120" height="120" viewBox={LOGO_VIEW_BOX}>
          {logoShapes()}
        </svg>
      </div>
    ),
    size
  );
}
