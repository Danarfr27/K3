import { redirect } from "next/navigation";

/** Home starts the authentication flow. */
export default function Home() {
  redirect("/login");
}
