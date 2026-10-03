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
// Le PIN de chaque barbier n'est PAS ici : il est haché et stocké en BDD /
// variable d'env (voir README + scripts/hash-pin.ts).
export type Barber = {
  id: string;
  name: string;
  tagline: string;
  isOwner?: boolean;
};

export const BARBERS: Barber[] = [
  { id: "3ebchi", name: "3EBCHI", tagline: "El King 🦍 — fondateur", isOwner: true },
  { id: "achref", name: "ACHREF", tagline: "Fade spécialiste" },
  { id: "brag", name: "BRAG", tagline: "Style w precision" },
  { id: "imed", name: "IMED", tagline: "Barbe w contours" },
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
// title : titre graffiti affiché sur le sticker.
// views : texte libre (ex "62.4K views").
// url   : lien complet de la vidéo TikTok.
export type TikTokVideo = {
  title: string;
  views: string;
  url: string;
};

export const VIDEOS: TikTokVideo[] = [
  { title: "Stour3ad cut ⚡", views: "62.4K views", url: "https://www.tiktok.com/@abdouabidi8/video/7207931763987926277" },
  { title: "Club Africain vibes ❤️🤍", views: "12.9K views", url: "https://www.tiktok.com/@abdouabidi8/video/7607875679320837394" },
  { title: "Clubiste fresh cut", views: "10.7K views", url: "https://www.tiktok.com/@abdouabidi8/video/7578576569094917388" },
  { title: "Hairstyle transformation", views: "11.3K views", url: "https://www.tiktok.com/@abdouabidi8/video/7109469999219117318" },
  { title: "Maghreb barbershop 🇹🇳🇱🇾🇩🇿", views: "4.1K views", url: "https://www.tiktok.com/@abdouabidi8/video/7533378595285159173" },
  { title: "Ali Youssef ⚽✂️", views: "3.3K views", url: "https://www.tiktok.com/@abdouabidi8/video/7479957347922709766" },
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
