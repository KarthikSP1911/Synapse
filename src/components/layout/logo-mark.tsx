import { cn } from "@/lib/utils";

/**
 * The Synapse mark: the half-circuit, half-colour brain in `public/brand/synapse-logo.png` (transparent, cropped
 * square). The header, splash and install prompt show it through this component; the favicon, Apple icon and
 * PWA icons are the same image on a black tile (`app/icon.png`, `app/apple-icon.png`, `public/icons/`).
 */
export function LogoMark({ className, src = "/brand/synapse-logo.png" }: { className?: string; src?: string }) {
  // A plain <img>: the file is tiny, static and precached, so the optimizer would only add a request.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden width={512} height={512} className={cn("object-contain", className)} />;
}
