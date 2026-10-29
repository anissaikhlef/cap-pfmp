import type { NextConfig } from "next";

// Politique de contenu : uniquement des ressources du site lui-même (en développement, Next a besoin d'eval).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const config: NextConfig = {
  poweredByHeader: false,
  // Lecture du texte des PDF sur le serveur (documents du lycée, CV) : pdfjs est chargé tel quel depuis node_modules.
  // Lecture des CV en photo, sur le serveur : tesseract.js et les données du français, chargés tels quels.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/tesseract.js/**", "./node_modules/tesseract.js-core/**", "./node_modules/@tesseract.js-data/fra/4.0.0/**",
      "./node_modules/bmp-js/**", "./node_modules/is-url/**", "./node_modules/node-fetch/**", "./node_modules/opencollective-postinstall/**",
      "./node_modules/regenerator-runtime/**", "./node_modules/wasm-feature-detect/**", "./node_modules/zlibjs/**", "./node_modules/idb-keyval/**",
      "./node_modules/whatwg-url/**", "./node_modules/tr46/**", "./node_modules/webidl-conversions/**",
    ],
  },
  // Image Docker autonome uniquement quand on la construit (voir Dockerfile)
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Pas d'optimisation d'images distante : aucune image externe n'est servie.
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
