import type { MetadataRoute } from "next";

/**
 * PWA dell'atleta: si apre dalla Home del telefono e riparte da "/", che
 * decide il passo giusto (login, percorso o programma).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Performance Factory",
    short_name: "PF",
    description: "Il tuo percorso Performance Factory, sempre a portata.",
    lang: "it",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
