import { redirect } from "next/navigation";
export default function GoogleConsentsPage() {
  redirect("/journey?google=complete");
}
