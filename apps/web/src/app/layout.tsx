import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import { SiteHeader } from "../components/SiteHeader";
import { sessionClientForRequest } from "../server/auth/request-session";
import { isSignedIn } from "../server/auth/is-signed-in";
import { logFailure } from "../server/log";
import "../design/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "InternRadar", template: "%s · InternRadar" },
  description:
    "Graduate and internship programs for Australian university students, checked against your eligibility.",
};

export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  // The header depends on who is asking, so it is built from the session on every request. If the
  // session cannot be read at all (say the auth settings are missing), the site still renders, as
  // for a visitor.
  let signedIn = false;
  try {
    signedIn = await isSignedIn(await sessionClientForRequest());
  } catch (error) {
    logFailure("layout.session", error);
  }

  return (
    <html lang="en">
      <body>
        <SiteHeader signedIn={signedIn} />
        {children}
      </body>
    </html>
  );
}
