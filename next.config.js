/** @type {import("next").NextConfig} */
const config = {
  // `next dev` and `next build` write different directories, so a dev server running
  // beside a production build never reads the other's chunks.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // A local tool: nothing here is for search engines.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default config;
