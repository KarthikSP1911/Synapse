/** Re-mounts on every navigation, so each page eases in instead of snapping into place. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">{children}</div>;
}
