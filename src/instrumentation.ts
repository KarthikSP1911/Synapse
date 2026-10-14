import type { Instrumentation } from "next";

/** Runs once when the server starts: the Node.js process-wide handlers are installed (see instrumentation-node.ts). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") (await import("./instrumentation-node")).registerNodeHandlers();
}

/**
 * Called by Next.js for every error it catches while serving a request: a page that failed to render, an API route that
 * threw, a Server Action (sign-in, sign-up) that threw, the proxy. This is where the errors that reach the "Something
 * went wrong" page are written down. The `digest` is the hash the error page shows, so it doubles as the reference.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { log } = await import("@/lib/logger");
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  log.error(
    `Unhandled error in ${context.routeType} ${context.routePath}`,
    error,
    {
      method: request.method,
      path: request.path.split("?")[0],
      routeType: context.routeType,
      routePath: context.routePath,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
    digest
  );
};
