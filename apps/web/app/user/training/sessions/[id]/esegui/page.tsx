"use client";
import { use } from "react";
import { SessionPlayer } from "./session-player";
export default function SessionRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SessionPlayer id={use(params).id} />;
}
