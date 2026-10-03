import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import { SiteHeader } from "../components/SiteHeader";
import "../design/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "InternRadar", template: "%s · InternRadar" },
  description:
    "Graduate and internship programs for Australian university students, checked against your eligibility.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
