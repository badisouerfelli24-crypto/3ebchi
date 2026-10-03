"use client";

import { useEffect, useRef, useState } from "react";

/** Enveloppe un bloc et le fait apparaître au scroll (respecte reduced-motion). */
export default function Reveal({
  children,
  className = "",
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cls = `reveal ${visible ? "is-visible" : ""} ${className}`;
  const Tag = as as React.ElementType;
  return (
    <Tag ref={ref} className={cls}>
      {children}
    </Tag>
  );
}
