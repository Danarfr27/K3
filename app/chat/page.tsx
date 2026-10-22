import ChatLayout from "@/components/chat/ChatLayout";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, isValidSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  const session = cookies().get(AUTH_COOKIE)?.value;
  if (!isValidSession(session)) {
    redirect("/login");
  }

  return <ChatLayout />;
}
