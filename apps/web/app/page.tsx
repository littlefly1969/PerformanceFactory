"use client";

import { useEffect } from "react";
import Image from "next/image";
import { API_BASE, secureFetch } from "@/app/lib/api";

const destinationFor = (
  role?: string,
  onboardingRequired?: boolean,
  consentRequired?: boolean,
) => {
  if (consentRequired) {
    return "/consents";
  }
  if (role === "USER") {
    return onboardingRequired ? "/onboarding" : "/user";
  }
  if (role === "PROFESSIONAL") {
    return "/professional";
  }
  if (role === "ADMIN") {
    return "/admin/cycles";
  }
  return "/login";
};

export default function Home() {
  useEffect(() => {
    const route = async () => {
      const response = await secureFetch(`${API_BASE}/auth/me`, {
        credentials: "include",
      });

      if (!response.ok) {
        window.location.href = "/login";
        return;
      }

      const me = (await response.json()) as {
        role?: string;
        onboardingRequired?: boolean;
        consentRequired?: boolean;
      };
      window.location.href = destinationFor(
        me.role,
        me.onboardingRequired,
        me.consentRequired,
      );
    };

    void route();
  }, []);

  return (
    <main className="pf-redirect-page">
      <div className="pf-brand pf-brand-with-logo" aria-label="Performance Factory">
        <Image
          className="pf-brand-logo"
          src="/brand/performance-factory-horizontal-clean.png"
          alt="Performance Factory"
          width={900}
          height={211}
          priority
        />
      </div>
    </main>
  );
}
