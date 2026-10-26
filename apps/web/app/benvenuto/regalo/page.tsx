"use client";

import { useEffect, useState } from "react";
import { API_BASE, secureFetch } from "@/app/lib/api";
import { GiftScreen, NEXT_STEP, type GiftView } from "./gift-screen";
import "./gift.css";

type Loaded = Extract<GiftView, { enabled: true }>;

export default function GiftPage() {
  const [gift, setGift] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const response = await secureFetch(
        `${API_BASE}/athlete-journey/free-lesson/gift`,
      );
      if (!alive) return;
      if (response.status === 401 || response.status === 403)
        return window.location.replace("/login");
      if (!response.ok) return setFailed(true);
      const view = (await response.json()) as GiftView;
      // Senza lezione attiva o senza circoli non c'è un regalo da promettere.
      if (!view.enabled || view.clubs.length === 0)
        return window.location.replace(NEXT_STEP);
      setGift(view);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const next = () => window.location.assign(NEXT_STEP);

  if (!gift && !failed) return <main className="pf-gift" aria-busy="true" />;
  return (
    <GiftScreen
      clubs={gift?.clubs ?? []}
      areas={gift?.areas ?? []}
      onContinue={next}
      onSkip={next}
    />
  );
}
