import { ImageResponse } from "next/og";

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
          background: "#0a0a0a",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 32 32">
          <path
            d="M10.5 10.5l11 11M21.5 10.5l-11 11"
            fill="none"
            stroke="#fafafa"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    size
  );
}
