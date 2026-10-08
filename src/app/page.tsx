import { Suspense } from "react";
import type { Metadata } from "next";

import Sectioner from "./_components/Sectioner";

export const metadata: Metadata = {
  title: "Sectioner",
  description: "Annotate regions on scanned pages and spans in texts, for training and evaluating models.",
};

// The page is the client app; the server only serves the shell. The global styles the
// design sets on the document (scrollbars, the pulse of an unassigned block) go in here
// because the site's layout deliberately loads no font and no body style.
export default function Page() {
  return (
    <>
      <style>{`
        .om-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .om-scroll::-webkit-scrollbar-thumb { background: #c9c3b6; border-radius: 6px; border: 2px solid transparent; background-clip: content-box; }
        .om-scroll::-webkit-scrollbar-track { background: transparent; }
        @keyframes pulseUn { 0%,100% { opacity: 0.55 } 50% { opacity: 1 } }
        body { margin: 0; background: #efece5; }
        * { box-sizing: border-box; }
        ::selection { background: oklch(0.82 0.13 75); }
        [role="menuitem"]:focus, [role="menuitem"]:hover:not([aria-disabled]) { background: #eae5da; }
      `}</style>
      <Suspense fallback={null}>
        <Sectioner />
      </Suspense>
    </>
  );
}
