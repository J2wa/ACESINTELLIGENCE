import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers(){return [{source:'/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Cache-Control',value:'private, no-store'}]}];},
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'],
  },
};

export default nextConfig;
