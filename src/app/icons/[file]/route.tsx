import { PWA_ICONS, isPwaIconFile, renderPwaIcon } from "@/lib/pwa-icon";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PWA_ICONS).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!isPwaIconFile(file)) return new Response("Not found", { status: 404 });
  return renderPwaIcon(file);
}
