import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Saída standalone melhora cold-start no Railway
  output: "standalone",

  // Compressão gzip nas respostas
  compress: true,

  // Desabilitar headers de debug em produção
  poweredByHeader: false,

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
};

export default nextConfig;

