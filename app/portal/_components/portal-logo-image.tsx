"use client";

import { useState } from "react";

interface PortalLogoImageProps {
  logoUrl: string | null;
}

export function PortalLogoImage({ logoUrl }: PortalLogoImageProps) {
  const [error, setError] = useState(false);

  if (logoUrl && !error) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt="Logo"
        width={32}
        height={32}
        className="object-contain rounded-lg"
        style={{ width: 32, height: 32 }}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "0.02em",
        }}
      >
        DR
      </span>
    </div>
  );
}
