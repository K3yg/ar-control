import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#141414",
          color: "#f2f2f2",
          fontSize: 260,
          fontFamily: "monospace",
          letterSpacing: -10,
        }}
      >
        ar
      </div>
    ),
    size,
  );
}
