"use client";

import { useEffect, useState } from "react";

const GLYPHS = "01{}[]<>/#$*+=?;:ӘҒҚҢӨҰҮҺІ";

/**
 * «Декодталатын» мәтін: кездейсоқ таңбалар солдан оңға қарай нақты мәтінге айналады.
 * Шрифт monospace болғандықтан ені өзгермейді — layout секірмейді.
 * «Reduce motion» қосулы болса, бірден нақты мәтін көрсетіледі.
 */
export default function Decode({ text, duration = 600, delay = 0 }: { text: string; duration?: number; delay?: number }) {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const step = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - start) / duration));
      const n = Math.floor(k * text.length);
      let out = text.slice(0, n);
      for (let i = n; i < text.length; i++) out += text[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      setShown(out);
      if (k < 1) raf = requestAnimationFrame(step);
      else setShown(text);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, duration, delay]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{shown}</span>
    </>
  );
}
