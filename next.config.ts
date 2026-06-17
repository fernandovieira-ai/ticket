import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Saída standalone melhora cold-start no Railway
  output: "standalone",

  // Compressão gzip nas respostas
  compress: true,

  // Desabilitar headers de debug em produção
  poweredByHeader: false,

  // Servir imagens em WebP/AVIF — reduz tamanho 40-60%
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Build ID consistente baseado no git commit ou timestamp
  // Evita que Server Actions sejam invalidadas desnecessariamente
  generateBuildId: async () => {
    // Usa a variável de ambiente RAILWAY_GIT_COMMIT_SHA se disponível
    // Caso contrário, usa timestamp para desenvolvimento local
    return process.env.RAILWAY_GIT_COMMIT_SHA || `build-${Date.now()}`;
  },

  experimental: {
    // Reduz tamanho do bundle do servidor
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "recharts",
      "sonner",
      "@base-ui/react",
    ],
  },

  // Headers de cache otimizados
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
      {
        // Cache de assets estáticos por 1 ano
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Cache de imagens públicas por 1 dia
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=43200",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

