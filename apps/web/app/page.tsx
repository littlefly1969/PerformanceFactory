"use client";

import { useEffect } from "react";
import { API_BASE, secureFetch } from "@/app/lib/api";

const destinationFor = (role?: string, onboardingRequired?: boolean) => {
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
      };
      window.location.href = destinationFor(me.role, me.onboardingRequired);
    };

    void route();
  }, []);

  return (
    <main className="pf-redirect-page">
      <div className="pf-brand">
        <span className="pf-brand-mark">PF</span>
        <span>
          <strong>PerformanceFactory</strong>
          <small>Opening workspace</small>
        </span>
      </div>
    </main>
  );
}
