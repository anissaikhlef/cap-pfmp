import type { MetadataRoute } from "next";

/** Permet d'installer Cap PFMP comme une application (ordinateur et téléphone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cap PFMP",
    short_name: "Cap PFMP",
    description: "Suivi des stages en lycée professionnel",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F2F4F7",
    theme_color: "#1C3354",
    icons: [
      { src: "/icones/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icones/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icones/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
