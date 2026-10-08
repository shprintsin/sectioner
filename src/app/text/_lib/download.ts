// Handing a finished export to the user. Browser-only, and deliberately tiny.
//
// Separate from `tei.ts` so the serialisers stay pure and testable: building the XML and
// putting it on someone's disk are different jobs, and only one of them needs a DOM.

/** Trigger a download of `content` as `filename`, UTF-8. */
export function download(filename: string, content: string, mime: string): void {
  // The BOM question again: none here either. A CSV without one opens correctly
  // everywhere except Excel-on-Windows, which guesses the locale codepage and mangles
  // Hebrew — but adding one corrupts the file for pandas, R and every diff. The file is
  // read by scripts far more often than by Excel, so it stays clean.
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A filesystem-safe stem from a project id and a kind. */
export function exportName(projectId: string, kind: string, ext: string): string {
  return `${projectId.replace(/[^A-Za-z0-9_-]+/g, "-")}.${kind}.${ext}`;
}
