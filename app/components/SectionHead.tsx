/** En-tête de section façon "// 01 — LABEL" + gros titre + sous-titre. */
export default function SectionHead({
  n,
  label,
  title,
  outline,
  sub,
}: {
  n: string;
  label: string;
  title: string;
  outline?: string;
  sub?: string;
}) {
  return (
    <div className="mb-10 sm:mb-14">
      <p className="label" data-reveal>
        // {n} — {label}
      </p>
      <h2 className="display mt-4 text-[13vw] sm:text-7xl" data-reveal style={{ ["--d" as string]: "80ms" }}>
        <span className="chroma">{title}</span>
        {outline && (
          <>
            {" "}
            <span className="outline-text">{outline}</span>
          </>
        )}
      </h2>
      {sub && (
        <p className="mt-5 max-w-xl text-base text-muted sm:text-lg" data-reveal style={{ ["--d" as string]: "160ms" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
