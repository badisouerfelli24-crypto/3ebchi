"use client";

import { useEffect, useRef, useState } from "react";
import { VIDEOS, SITE, type TikTokVideo } from "@/config/site";

/** Extrait l'ID numérique d'une URL de vidéo TikTok. */
function videoId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

export default function TikTokGrid() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [load, setLoad] = useState(false);

  // Charge embed.js seulement quand la grille approche du viewport (perf).
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLoad(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Injecte / relance le script d'embed TikTok.
  useEffect(() => {
    if (!load) return;
    const existing = document.getElementById("tiktok-embed-script");
    if (existing) {
      // @ts-expect-error API globale TikTok
      window.tiktokEmbed?.lib?.render?.(document.querySelectorAll(".tiktok-embed"));
      return;
    }
    const s = document.createElement("script");
    s.id = "tiktok-embed-script";
    s.src = "https://www.tiktok.com/embed.js";
    s.async = true;
    document.body.appendChild(s);
  }, [load]);

  return (
    <section id="videos" className="px-5 py-14" aria-label="Best of TikTok">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <span className="sticker text-base">🔥 Best of TikTok</span>
          <h2 className="mt-4 font-marker text-4xl text-chalk sm:text-5xl">
            <span className="tag-underline">Chouf</span> el coupes
          </h2>
        </div>

        <div ref={sectionRef} className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {VIDEOS.map((v) => (
            <VideoCard key={v.url} video={v} load={load} />
          ))}
        </div>

        <div className="mt-10 text-center">
          <a
            href={SITE.tiktokUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="spray-btn inline-block rounded-md border-2 border-hot px-6 py-3 font-bebas text-xl tracking-wide text-hot"
          >
            Kol l&apos;videos 3la TikTok {SITE.tiktokHandle} ↗
          </a>
        </div>
      </div>
    </section>
  );
}

function VideoCard({ video, load }: { video: TikTokVideo; load: boolean }) {
  const id = videoId(video.url);

  return (
    <div className="tape-card flex flex-col overflow-hidden rounded-lg p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="sticker text-sm">{video.title}</span>
        <span className="font-bebas text-sm tracking-wide text-chalk/60">
          {video.views}
        </span>
      </div>

      <div className="min-h-[360px] flex-1">
        {load && id ? (
          // Embed officiel TikTok (remplacé par un iframe quand embed.js tourne).
          <blockquote
            className="tiktok-embed"
            cite={video.url}
            data-video-id={id}
            style={{ maxWidth: "100%", minWidth: "100%", margin: 0 }}
          >
            <section>
              {/* Fallback affiché si l'embed ne se charge pas */}
              <a href={video.url} target="_blank" rel="noopener noreferrer">
                Chouf 3la TikTok ↗
              </a>
            </section>
          </blockquote>
        ) : (
          // État avant chargement / fallback statique (lien direct)
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-md border border-chalk/10 bg-ink/60 p-6 text-center transition hover:border-spray/60"
          >
            <span className="text-5xl">💈</span>
            <span className="mt-4 font-bebas text-xl tracking-wide text-spray">
              Chouf 3la TikTok ↗
            </span>
            <span className="mt-1 text-sm text-chalk/50">{video.views}</span>
          </a>
        )}
      </div>

      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 text-center font-bebas text-lg tracking-wide text-spray hover:text-hot"
      >
        Chouf 3la TikTok ↗
      </a>
    </div>
  );
}
