"use client";

import { useState } from "react";
import { signOut } from "@/app/lib/api";

export function LogoutButton({ className }: { className?: string }) {
  const [loggingOut, setLoggingOut] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setLoggingOut(true);
        void signOut();
      }}
      disabled={loggingOut}
    >
      {loggingOut ? "Uscita..." : "Esci"}
    </button>
  );
}
