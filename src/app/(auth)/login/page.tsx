import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Kalari" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const profile = await getProfile();
  if (profile) redirect("/dashboard");

  const { next } = await searchParams;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-paper px-5 py-10">
      <div className="w-full max-w-[380px]">
        <Suspense>
          <LoginForm next={next} />
        </Suspense>
      </div>
    </main>
  );
}
