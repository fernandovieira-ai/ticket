import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { MeusTicketsClient } from "./meus-tickets-client";

export default function MeusTicketsPage() {
  return (
    <div className="h-full">
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        }
      >
        <MeusTicketsClient />
      </Suspense>
    </div>
  );
}
