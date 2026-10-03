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
| **Les barbiers** (nom, punchline) | `BARBERS` |
| **Les services et les prix** | `SERVICES` |
| **Les vidéos TikTok** affichées | `VIDEOS` |

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

## 📅 Voir / gérer les réservations

- Va sur **`/barber`** (lien discret « Espace barber 🔒 » en bas du site).
- Chaque barbier entre **son PIN**.
- Il voit **ses** réservations (aujourd'hui en premier, puis à venir) avec :
  nom du client, téléphone (clic = appel, bouton WhatsApp), service, heure, note.
- Actions : **✅ Done**, **✖ Annuler** (libère le créneau), **⛔ Bloquer**
  un créneau ou une journée (pause / absence).
- **3ebchi (le patron)** a en plus un bouton **👑 Voir tous** + des **stats**
  (réservations aujourd'hui / cette semaine, par barbier).

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

Générer un `SESSION_SECRET` :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ▲ Déployer sur Vercel

1. Pousse le code sur GitHub.
2. Sur [vercel.com](https://vercel.com) → **Add New → Project** → importe le repo.
3. **Environment Variables** : ajoute les 3 variables ci-dessus
   (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`).
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
