import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Sectioner",
  description: "Annotate regions on scanned pages and spans in texts.",
  robots: { index: false, follow: false },
};

// No font and no body style here: each page owns its typography, and every font is a
// local stack, so the app runs offline.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
