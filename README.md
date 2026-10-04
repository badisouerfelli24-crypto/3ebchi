# 3EBCHI STYLE 💈 — Site barbershop (Tunis)

Site web + système de réservation pour le salon **3EBCHI STYLE**.
Stack : **Next.js (App Router) + TypeScript + Tailwind + Supabase**. Déployable sur **Vercel**.

> Let's shake things up 🔥 — Coupe propre, style 3ebchi.

---

## 📁 Ce que tu peux changer facilement

**Presque tout le contenu se change dans UN SEUL fichier :**

### 👉 `config/site.ts`

| Pour changer… | Section dans `config/site.ts` |
|---|---|
| Nom, tagline, ville, lien Maps, TikTok, téléphone | `SITE` |
| Les chiffres du bandeau (followers, likes…) | `STATS` |
| **Les horaires d'ouverture** (jours fermés, heures) | `HOURS` |
| **La durée d'un créneau** (30 min par défaut) | `SLOT_MINUTES` |
| Combien de jours à l'avance on peut réserver | `BOOKING_WINDOW_DAYS` |
| **Les barbiers** (nom, punchline, photo) | `BARBERS` |
| **Les services et les prix** | `SERVICES` |
| **Les reels** (carrousel vidéo) | `VIDEOS` + fichiers dans `public/reels/` |

Après chaque modif : si en local, le site se recharge tout seul (`npm run dev`).
En production : **re-déployer** (un `git push` suffit si connecté à Vercel).

### Changer les prix / horaires / vidéos — exemple

```ts
// config/site.ts

// Changer un prix :
{ id: "coupe", name: "Coupe simple", price: 18, durationMin: 30 }, // 15 -> 18 DT

// Fermer aussi le mardi :
{ day: 2, label: "Mardi", closed: true },

// Ajouter une vidéo TikTok :
{ title: "Nouvelle coupe 🔥", views: "5K views", url: "https://www.tiktok.com/@abdouabidi8/video/XXXX" },
```

### Ajouter un reel (vidéo)

Les vidéos sont hébergées **sur le site** (pas d'intégration TikTok) : lecture fluide,
sans logo ni boutons, aucune vidéo noire ou recadrée.

1. Mets la vidéo dans `public/reels/` (ex : `public/reels/nouvelle-coupe.mp4`) et une
   image de couverture `public/reels/nouvelle-coupe.jpg`.
   Conseil : vidéo verticale 9:16, compressée (~1 Mo). Avec ffmpeg :
   ```bash
   ffmpeg -i source.mp4 -vf "scale=540:960:force_original_aspect_ratio=increase,crop=540:960" \
     -c:v libx264 -crf 30 -maxrate 900k -bufsize 1800k -c:a aac -b:a 80k -movflags +faststart public/reels/nouvelle-coupe.mp4
   ffmpeg -ss 0.8 -i public/reels/nouvelle-coupe.mp4 -frames:v 1 public/reels/nouvelle-coupe.jpg
   ```
2. Ajoute une ligne dans `VIDEOS` (`config/site.ts`) avec `src` et `poster`.

### Ancienne version (graffiti)

L'ancienne version a été retirée du site. Elle reste uniquement dans la branche git
`v1-graffiti`.

### Accès à l'espace hajem

L'espace hajem (`/barber`) n'apparaît nulle part sur le site public et répond 404 sur
le domaine de production. Il n'est accessible que via :
**https://3ebchi-style-git-preview-badis4.vercel.app/barber**
(liste modifiable avec la variable d'env `ADMIN_HOSTS`, voir `middleware.ts`).

### Ajouter / changer la photo d'un barbier

1. Mets le fichier dans `public/barbers/` (ex : `public/barbers/imed.jpg`).
2. Dans `config/site.ts`, ajoute `photo` au barbier :
   ```ts
   { id: "imed", name: "IMED", tagline: "Barbe w contours", photo: "/barbers/imed.jpg" },
   ```
   Sans `photo`, la carte affiche les **initiales** du barbier (fallback).

---

## 🔐 Changer un PIN de barbier

Les PIN **ne sont jamais en clair** : ils sont hachés (bcrypt) et stockés dans la
table `barbers` de Supabase.

1. Génère le hash :
   ```bash
   npm run hash-pin 3ebchi 1234
   ```
   (remplace `3ebchi` par l'id du barbier et `1234` par le nouveau PIN à 4 chiffres)

2. La commande affiche une requête SQL toute prête, par ex :
   ```sql
   update public.barbers set pin_hash = '$2a$10$...' where id = '3ebchi';
   ```

3. Colle-la dans **Supabase → SQL Editor → Run**. C'est fait ✅

> Les identifiants de barbiers (`3ebchi`, `achref`, `brag`, `imed`) doivent
> correspondre aux `id` dans `config/site.ts` **et** dans la table `barbers`.

---

## 📅 Dashboard hajem (réservations, stats, notifications)

- Va sur **`/barber`** (domaine admin uniquement, voir plus haut) et entre **ton PIN**.
- Barbers : 3EBCHI (owner), ACHREF, BRAG, BAFFI (id interne `imed`).
- Mode **sombre** par défaut, mode **clair** en un clic (☀️). Pensé mobile d'abord.

**Stats** — pour Aujourd'hui, Hier, Semaine, Mois et Total :
nombre de réservations, **encaissé** (seules les réservations marquées
« Hjema faite » comptent), **taux hjema** (hjemas faites ÷ réservations dont
l'issue est posée), ticket moyen, courbe interactive (7/30/90 jours, touche ou
survole pour le détail), issues des réservations, heures de pointe.
Semaine / mois / total sont comptés « à date » et comparés au même moment de la
période précédente. Les réservations futures sont dans « À venir ».

**Agenda** — « À clôturer » (rendez-vous passés sans issue), aujourd'hui, à venir,
clôturées récemment. Sur chaque rendez-vous passé : **Hjema faite**, **Pas venu** ou
**Annulée** (modifiable ensuite avec « Modifier »). Un rendez-vous futur peut être
annulé (libère le créneau). Appel / WhatsApp en un clic. Blocages (pause / absence).

**Qui voit quoi**
- Chaque hajem ne voit **que ses** réservations et ses stats.
- **3EBCHI** a des dashboards séparés : **Boutique** (toute l'équipe, avec le taux
  hjema et le classement par hajem), **le sien**, et **un par membre**.

**Notifications (gratuites)** — Réglages → « Activer sur cet appareil ».
Chaque hajem reçoit une notification pour **ses** nouvelles réservations.
3EBCHI reçoit aussi celles de l'équipe et peut **couper chaque membre** séparément.
Quand le dashboard est ouvert, une alerte + un petit son s'affichent en direct.
- **iPhone** : ouvre `/barber` dans Safari → Partager → « Sur l'écran d'accueil »,
  puis ouvre « 3EBCHI Pro » depuis l'icône et active les notifications (exigence d'Apple).
- Android / ordinateur : directement depuis le navigateur.

### Activer le dashboard (une seule fois)

1. **Supabase → SQL Editor** : colle et lance
   [`supabase/migration_dashboard.sql`](supabase/migration_dashboard.sql)
   (ajoute « Pas venu », les abonnements push et les préférences — ne supprime rien).
2. **Clés de notification** (Web Push, gratuites — aucun service payant) :
   ```bash
   npx web-push generate-vapid-keys
   ```
   Ajoute sur Vercel : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et
   `VAPID_SUBJECT` (ex : `mailto:ton-email@exemple.com`), puis redéploie.
   Sans ces clés, tout marche sauf les notifications push.

---

## 🚀 Installation & lancement en local

```bash
# 1. Installer les dépendances
npm install

# 2. Créer le fichier d'env
cp .env.example .env.local
# puis remplir NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET

# 3. Lancer
npm run dev
# -> http://localhost:3000
```

---

## 🗄️ Créer la base Supabase (étape par étape)

1. Va sur [supabase.com](https://supabase.com) → **New project** (choisis une région
   proche, ex : *Europe (Frankfurt)*). Note le mot de passe de la base.
2. Quand le projet est prêt : **Project Settings → API**. Copie :
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY`
3. **SQL Editor → New query** : colle **tout** le contenu de
   [`supabase/migration.sql`](supabase/migration.sql) → **Run**.
   Ça crée les tables, la protection anti-double-booking, et les 4 barbiers.
   Puis fais pareil avec [`supabase/migration_dashboard.sql`](supabase/migration_dashboard.sql).
4. Définis les PIN (voir « Changer un PIN » plus haut) — un `update` par barbier.

> La migration active la **RLS** sans policy publique : personne ne peut lire la
> base depuis le navigateur. Seul le serveur (service role key) y accède, via les
> routes API. **Ne mets jamais la service role key côté client.**

---

## 🔑 Variables d'environnement

Voir [`.env.example`](.env.example).

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé secrète serveur (⚠️ jamais exposée) |
| `SESSION_SECRET` | Secret pour signer les sessions barbier (≥ 32 car.) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Clés des notifications push (voir « Dashboard hajem ») |
| `VAPID_SUBJECT` | Contact pour les services push, ex : `mailto:toi@exemple.com` |

Générer un `SESSION_SECRET` :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ▲ Déployer sur Vercel

1. Pousse le code sur GitHub.
2. Sur [vercel.com](https://vercel.com) → **Add New → Project** → importe le repo.
3. **Environment Variables** : ajoute les variables ci-dessus
   (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`,
   et les 3 `VAPID_*` pour les notifications).
4. **Deploy**. Framework détecté automatiquement (Next.js).
5. Chaque `git push` redéploie le site.

---

## 🛡️ Sécurité & fiabilité (résumé technique)

- **Anti-double-booking au niveau BDD** : contrainte d'exclusion Postgres
  (`EXCLUDE USING gist`) sur `(barber, intervalle de temps)` pour les
  réservations `confirmed`. Deux clients ne peuvent pas prendre le même créneau,
  même simultanément. La création passe par une fonction SQL transactionnelle
  (`create_booking`).
- **Service role key côté serveur uniquement** (routes API / `lib/supabase.ts`
  marqué `server-only`).
- **PIN** : bcrypt, vérifiés côté serveur, session en **cookie httpOnly signé**,
  **verrouillage 10 min après 5 essais**.
- **Fuseau horaire** : toute la logique de créneaux est en **`Africa/Tunis`**.
- **Anti-spam** : honeypot + rate-limit IP sur la réservation.
- **Accessibilité** : labels, focus visibles, contrastes, pas de scroll horizontal,
  `prefers-reduced-motion` respecté.

---

## 🧱 Structure du projet

```
config/site.ts          → TOUT le contenu éditable
lib/                    → supabase, auth, slots, time, ics, validation, rateLimit
app/
  page.tsx              → page d'accueil (toutes les sections)
  barber/page.tsx       → espace barbier (login PIN + dashboard)
  components/           → Hero, Stats, TikTokGrid, Barbers, Services, Booking, …
  api/
    availability/       → créneaux dispo
    book/               → créer une réservation
    barber/             → login, logout, bookings, action, block
supabase/migration.sql  → schéma + sécurité BDD
scripts/hash-pin.ts     → génère les hash de PIN  (npm run hash-pin)
```

---

#3ebchi_style 💈 — *Let's shake things up* 🔥
