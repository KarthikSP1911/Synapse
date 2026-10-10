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
        <svg width="120" height="120" viewBox="0 0 32 32">
          <rect x="0" y="0" width="15" height="15" rx="3.5" fill="#fafafa" />
          <rect x="17" y="0" width="15" height="15" rx="3.5" fill="#71717a" />
          <rect x="0" y="17" width="15" height="15" rx="3.5" fill="#71717a" />
          <rect x="17" y="17" width="15" height="15" rx="3.5" fill="#fafafa" />
          <g fill="none" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round">
            <path d="M4.5 7.5h6M7.5 4.5v6" />
            <path d="M21.5 7.5h6" />
            <path d="M5.5 21.5l4 4M9.5 21.5l-4 4" />
            <path d="M21.5 24.5h6" />
          </g>
          <circle cx="24.5" cy="21" r="1.3" fill="#0a0a0a" />
          <circle cx="24.5" cy="28" r="1.3" fill="#0a0a0a" />
        </svg>
      </div>
    ),
    size
  );
}
