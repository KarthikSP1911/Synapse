"use client";

import { useEffect } from "react";
import { log } from "@/lib/logger";

/**
 * The last resort: an error in the root layout itself, where nothing of the app (styles, theme, components) can be
 * relied on. It replaces the whole page, so it brings its own document and plain styles.
 */
export default function GlobalError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  useEffect(() => {
    log.error("The root layout failed", error, { page: location.pathname }, error.digest);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#000", color: "#fafafa", font: "16px system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", textAlign: "center" }}>
        <main style={{ maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ color: "#a1a1a1", margin: "0 0 16px" }}>Mathz couldn&apos;t start. This is usually a temporary problem; reloading often fixes it.</p>
          {error.digest && <p style={{ color: "#a1a1a1", fontSize: 12 }}>Reference {error.digest}</p>}
          <button
            type="button"
            onClick={() => (retry ? retry() : reset())}
            style={{ marginRight: 8, padding: "10px 16px", borderRadius: 8, border: 0, background: "#fafafa", color: "#000", font: "inherit", cursor: "pointer" }}
          >
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#fafafa", font: "inherit", cursor: "pointer" }}>
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
