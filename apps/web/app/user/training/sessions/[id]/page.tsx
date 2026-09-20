"use client";
import { use } from "react";
import { SessionDetail } from "./session-detail";
export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SessionDetail id={use(params).id} />;
}
