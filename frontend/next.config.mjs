/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // e2e runs use their own build dir so they never clash with a running `npm run dev`
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
