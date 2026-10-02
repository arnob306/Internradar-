import type { ReactElement } from "react";

// A placeholder until the programs feed arrives in the next slice.
export default function HomePage(): ReactElement {
  return (
    <main className="page" style={{ paddingTop: 64, paddingBottom: 64 }}>
      <h1 style={{ fontSize: "2.75rem", margin: 0, maxWidth: 720 }}>
        Graduate and internship programs, checked against you.
      </h1>
      <p className="muted" style={{ fontSize: "1.125rem", maxWidth: 640 }}>
        Every program links to the employer&apos;s own page. We show whether you&apos;re eligible,
        and say so plainly when we can&apos;t tell.
      </p>
    </main>
  );
}
