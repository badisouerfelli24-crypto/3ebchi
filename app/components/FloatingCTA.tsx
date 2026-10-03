"use client";

import { useEffect, useState } from "react";

/** Bouton "Réservi" flottant : apparaît après le hero, se cache sur la section réservation. */
export default function FloatingCTA() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const booking = document.getElementById("booking");
    let bookingVisible = false;
    const io = new IntersectionObserver(([e]) => {
      bookingVisible = e.isIntersecting;
      update();
    }, { threshold: 0.15 });
    if (booking) io.observe(booking);
    function update() {
      const intro = document.getElementById("intro")?.offsetHeight ?? 0; // pas pendant l'intro
      setShow(window.scrollY > intro + window.innerHeight * 0.8 && !bookingVisible);
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <a
      href="#booking"
      className={`btn btn-primary fixed bottom-4 left-1/2 z-40 -translate-x-1/2 shadow-2xl transition-all duration-500 ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-24 opacity-0"
      }`}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
    >
      Réservi 💈 <span aria-hidden>→</span>
    </a>
  );
}
