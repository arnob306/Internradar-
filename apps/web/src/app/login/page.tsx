import type { Metadata } from "next";
import type { ReactElement } from "react";
import { LoginForm } from "../../components/LoginForm";
import { safeNextPath } from "../../features/auth/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const error = params["error"];

  return (
    <main className="page login">
      <h1 className="login-title">Sign in</h1>
      <p className="login-lede muted">
        Your profile and applications are saved to your account. We&apos;ll email you a link to get in.
      </p>
      <LoginForm
        next={safeNextPath(params["next"])}
        notice={typeof error === "string" ? error : undefined}
      />
    </main>
  );
}
