import type { Metadata } from "next";
import type { ReactElement } from "react";
import { UnsubscribeButton } from "../../components/UnsubscribeButton";

// The link carries the id of one alert, so the page stays out of search engines and does not pass
// the address on to any other site.
export const metadata: Metadata = {
  title: "Stop alert emails",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * Where the link in an alert email lands. Opening it changes nothing: mail scanners open links, so
 * stopping the emails takes a press of the button.
 */
export default async function UnsubscribePage({ searchParams }: PageProps): Promise<ReactElement> {
  const { alert } = await searchParams;
  const alertId = typeof alert === "string" && UUID.test(alert) ? alert : null;

  return (
    <main className="page profile">
      {alertId === null ? (
        <p className="notice">This link doesn&apos;t look right. Open the link in the email again.</p>
      ) : (
        <>
          <h1 className="login-title">Stop alert emails?</h1>
          <p className="login-lede muted">
            You will no longer get emails when programs you follow open or change. You can still follow programs and
            see their dates here.
          </p>
          <UnsubscribeButton alertId={alertId} />
        </>
      )}
    </main>
  );
}
