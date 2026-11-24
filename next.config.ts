import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff', './node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-italic.woff'],
  },
};

export default nextConfig;
