/* =========================================================================
   3EBCHI STYLE 💈 — FICHIER DE CONFIGURATION UNIQUE
   -------------------------------------------------------------------------
   TOUT ce qui est "éditable" (barbiers, services, prix, horaires, durée des
   créneaux, vidéos TikTok, infos de contact) se change ICI.
   Pas besoin de toucher au reste du code.
   Après modif : redéployer (ou relancer `npm run dev`).
   ========================================================================= */

// -------------------------------------------------------------------------
// INFOS GÉNÉRALES
// -------------------------------------------------------------------------
export const SITE = {
  name: "3EBCHI STYLE",
  emoji: "💈",
  tagline: "Let's shake things up 🔥",
  subline: "Coupe propre, style 3ebchi — Tunis",
  city: "Tunis, Tunisie",
  // Fuseau horaire utilisé pour TOUTE la logique de créneaux. Ne pas changer.
  timezone: "Africa/Tunis",
  // Lien Google Maps du salon
  mapsUrl: "https://maps.app.goo.gl/y3SFGzhMyJbdC44f7",
  // TikTok
  tiktokHandle: "@abdouabidi8",
  tiktokUrl: "https://www.tiktok.com/@abdouabidi8",
  // Numéro WhatsApp/appel du salon (format international sans +, ex: 216XXXXXXXX)
  // Laisser vide si tu ne veux pas afficher de numéro salon.
  phone: "216XXXXXXXX",
} as const;

// -------------------------------------------------------------------------
// STATS (bandeau hype) — change les chiffres quand ça grandit 🔥
// -------------------------------------------------------------------------
export const STATS: { value: string; label: string }[] = [
  { value: "1.5K+", label: "followers" },
  { value: "11.7K+", label: "likes" },
  { value: "62K", label: "views sur une coupe" },
];

// -------------------------------------------------------------------------
// HORAIRES D'OUVERTURE
// -------------------------------------------------------------------------
// day = 0 (Dimanche) ... 6 (Samedi)  — convention JavaScript getDay()
// open/close au format "HH:MM" (24h). closed: true => jour fermé.
// Les créneaux de réservation sont générés à partir de ces horaires.
export type DayHours = {
  day: number;
  label: string; // affiché au client
  closed: boolean;
  open?: string; // "10:00"
  close?: string; // "21:00"
};

export const HOURS: DayHours[] = [
  { day: 1, label: "Lundi", closed: true }, // Lundi fermé
  { day: 2, label: "Mardi", closed: false, open: "10:00", close: "21:00" },
  { day: 3, label: "Mercredi", closed: false, open: "10:00", close: "21:00" },
  { day: 4, label: "Jeudi", closed: false, open: "10:00", close: "21:00" },
  { day: 5, label: "Vendredi", closed: false, open: "10:00", close: "21:00" },
  { day: 6, label: "Samedi", closed: false, open: "10:00", close: "21:00" },
  { day: 0, label: "Dimanche", closed: false, open: "10:00", close: "21:00" },
];

// Longueur d'un créneau en minutes (granularité de la réservation).
export const SLOT_MINUTES = 30;

// Combien de jours à l'avance on peut réserver.
export const BOOKING_WINDOW_DAYS = 14;

// -------------------------------------------------------------------------
// BARBIERS
// -------------------------------------------------------------------------
// id        : identifiant interne (minuscules, sans espace) — utilisé en BDD.
// name      : nom affiché.
// tagline   : petite punchline Darija.
// isOwner   : true pour 3ebchi (accès "tous les barbiers" + stats).
// photo     : chemin de la photo (dans /public). Laisser vide/undefined =>
//             affiche les initiales à la place. Pour ajouter une photo :
//             mets le fichier dans public/barbers/<id>.jpg puis renseigne
//             photo: "/barbers/<id>.jpg".
// Le PIN de chaque barbier n'est PAS ici : il est haché et stocké en BDD /
// variable d'env (voir README + scripts/hash-pin.ts).
export type Barber = {
  id: string;
  name: string;
  tagline: string;
  isOwner?: boolean;
  photo?: string;
};

export const BARBERS: Barber[] = [
  { id: "3ebchi", name: "3EBCHI", tagline: "El King 🦍 — fondateur", isOwner: true, photo: "/barbers/3ebchi.jpg" },
  { id: "achref", name: "ACHREF", tagline: "Fade spécialiste", photo: "/barbers/achref.jpg" },
  { id: "brag", name: "BRAG", tagline: "Style w precision", photo: "/barbers/brag.jpg" },
  // id "imed" conservé en interne (lié à la BDD et au PIN) — affiché "BAFFI".
  { id: "imed", name: "BAFFI", tagline: "Barbe w contours", photo: "/barbers/baffi.jpg" },
];

// -------------------------------------------------------------------------
// SERVICES & PRIX (placeholders — change les prix/durées librement)
// -------------------------------------------------------------------------
// id          : identifiant interne.
// name        : nom affiché.
// price       : prix en DT (nombre).
// durationMin : durée en minutes (doit être un multiple de SLOT_MINUTES,
//               sinon les services longs bloqueront les créneaux consécutifs
//               arrondis au multiple supérieur).
export type Service = {
  id: string;
  name: string;
  price: number;
  durationMin: number;
};

export const SERVICES: Service[] = [
  { id: "coupe", name: "Coupe simple", price: 15, durationMin: 30 },
  { id: "coupe_barbe", name: "Coupe + barbe", price: 25, durationMin: 45 },
  { id: "fade", name: "Dégradé (fade)", price: 20, durationMin: 30 },
  { id: "barbe", name: "Barbe seulement", price: 10, durationMin: 15 },
  { id: "enfant", name: "Coupe enfant", price: 12, durationMin: 30 },
  { id: "soin", name: "Soin visage", price: 20, durationMin: 30 },
];

// -------------------------------------------------------------------------
// VIDÉOS TIKTOK (Best of) — ajoute/enlève librement
// -------------------------------------------------------------------------
// title  : titre affiché sur la carte.
// views  : texte libre (ex "62.4K views").
// url    : lien de la vidéo TikTok d'origine (utilisé par la v1 + lien "voir").
// src    : fichier MP4 hébergé sur le site (public/reels/…) — lecture fluide,
//          sans logo ni boutons TikTok. Pour ajouter une vidéo : mets le .mp4
//          et une image .jpg (poster) dans public/reels/ puis ajoute une ligne.
// poster : image affichée avant la lecture (évite tout écran noir).
export type TikTokVideo = {
  title: string;
  views: string;
  url: string;
  src: string;
  poster: string;
};

export const VIDEOS: TikTokVideo[] = [
  { title: "Stour3ad cut ⚡", views: "62.4K", url: "https://www.tiktok.com/@abdouabidi8/video/7207931763987926277", src: "/reels/stour3ad.mp4", poster: "/reels/stour3ad.jpg" },
  { title: "Club Africain vibes ❤️🤍", views: "12.9K", url: "https://www.tiktok.com/@abdouabidi8/video/7607875679320837394", src: "/reels/club-africain.mp4", poster: "/reels/club-africain.jpg" },
  { title: "Hairstyle transformation", views: "11.3K", url: "https://www.tiktok.com/@abdouabidi8/video/7109469999219117318", src: "/reels/transformation.mp4", poster: "/reels/transformation.jpg" },
  { title: "Clubiste fresh cut", views: "10.7K", url: "https://www.tiktok.com/@abdouabidi8/video/7578576569094917388", src: "/reels/clubiste.mp4", poster: "/reels/clubiste.jpg" },
  { title: "Maghreb barbershop 🇹🇳🇱🇾🇩🇿", views: "4.1K", url: "https://www.tiktok.com/@abdouabidi8/video/7533378595285159173", src: "/reels/maghreb.mp4", poster: "/reels/maghreb.jpg" },
  { title: "Ali Youssef ⚽✂️", views: "3.3K", url: "https://www.tiktok.com/@abdouabidi8/video/7479957347922709766", src: "/reels/ali-youssef.mp4", poster: "/reels/ali-youssef.jpg" },
];

// -------------------------------------------------------------------------
// HELPERS (ne pas modifier sauf si tu sais ce que tu fais)
// -------------------------------------------------------------------------
export const getBarber = (id: string) => BARBERS.find((b) => b.id === id);
export const getService = (id: string) => SERVICES.find((s) => s.id === id);
export const isOwner = (id: string) => !!getBarber(id)?.isOwner;

// Nombre de créneaux consécutifs occupés par un service.
export const slotsForService = (service: Service) =>
  Math.max(1, Math.ceil(service.durationMin / SLOT_MINUTES));
