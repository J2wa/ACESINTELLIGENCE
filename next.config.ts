import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'],
  },
};

export default nextConfig;
