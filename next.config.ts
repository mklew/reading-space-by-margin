import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite','jsdom','pdf-parse'],
  outputFileTracingIncludes: {'/api/*': ['node_modules/@napi-rs/canvas*/**/*', 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs']},
  async headers() { return [{source:'/(.*)',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'no-referrer'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  ]}]; },
};
export default config;
