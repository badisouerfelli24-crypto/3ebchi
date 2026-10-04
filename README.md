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

1. Mets le fichier dans `public/barbers/` (ex : `public/barbers/baffi.jpg`).
2. Dans `config/site.ts`, ajoute `photo` au barbier :
   ```ts
   { id: "imed", name: "BAFFI", tagline: "Barbe w contours", photo: "/barbers/baffi.jpg" },
   ```
   Sans `photo`, la carte affiche les **initiales** du barbier (fallback).

---

## 🔐 Mot de passe des barbiers (remplace l'ancien PIN)

Depuis la migration `supabase/migrations/20261004120000_security_hardening.sql`,
l'espace hajem utilise un **mot de passe d'au moins 15 caractères** (une phrase de
4 mots ou plus est idéale). L'ancien PIN à 4 chiffres n'est plus accepté.
Le mot de passe n'est **jamais** stocké en clair : seul un hash **scrypt** est en base.

1. Sur ton ordinateur :
   ```bash
   npm run set-password -- 3ebchi
   ```
   Le mot de passe est demandé **masqué**, deux fois (jamais en argument, jamais affiché).
   Le script ne se connecte à aucune base : il affiche un bloc SQL.
2. Colle ce bloc dans **Supabase → SQL Editor → Run**. Il enregistre le hash,
   **déconnecte les anciennes sessions** de ce barbier et lève un éventuel blocage.
   Le bloc contient un hash : ne le partage pas, efface l'écran ensuite.
   (Sous Windows, cette commande marche dans PowerShell avec Node ≥ 20.)

Autres opérations (SQL Editor) :
```sql
-- déconnecter un barbier partout
select public.admin_sessions_revoke_all('achref');
-- désactiver / réactiver un compte (effet immédiat)
update public.barbers set active = false where id = 'achref';
-- retirer / donner le rôle propriétaire (il faut AUSSI isOwner dans config/site.ts)
update public.barbers set is_owner = false where id = '3ebchi';
-- lever un blocage après trop d'essais
delete from public.rate_limits where key = 'login:acct:achref';
```

> L'écran `/barber` est un champ mot de passe (masqué, compatible gestionnaires
> de mots de passe et copier-coller). Mise en production : suivre
> `docs/audits/PRODUCTION_READINESS.md`.

> Les identifiants de barbiers (`3ebchi`, `achref`, `brag`, `imed`) doivent
> correspondre aux `id` dans `config/site.ts` **et** dans la table `barbers`.

---

## 📅 Dashboard hajem (réservations, stats, notifications)

- Va sur **`/barber`** sur l'adresse admin (voir « Accès à l'espace hajem » ; aucun lien public).
- Chaque barbier entre **son mot de passe**.
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
   Puis fais pareil avec [`supabase/migration_dashboard.sql`](supabase/migration_dashboard.sql) (dashboard, notifications).
4. Puis colle et exécute **chaque fichier** de [`supabase/migrations/`](supabase/migrations/)
   dans l'ordre de leur nom (sécurité, sessions, limiteur, réservation v2…).
5. Étiquette la base (une seule fois, dans le SQL Editor de CE projet) :
   `insert into public.app_environment (name) values ('production');`
   (ou `'preview'` / `'development'` selon le projet).
6. Définis les mots de passe (voir « Mot de passe des barbiers » plus haut).
7. Vérifie : `select public.release_preflight('pre-deploy');` doit renvoyer `"ok": true`.

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
| `SESSION_SECRET` | Secret serveur (≥ 32 car.) : clé HMAC des adresses du limiteur |
| `DATA_ENVIRONMENT` | **Obligatoire partout** : `production`, `preview`, `development` ou `test`. Sur Vercel, **égal** à l'environnement. Doit aussi correspondre à l'étiquette stockée dans la base (`public.app_environment`), sinon le serveur refuse d'accéder à la base (voir `lib/supabase.ts`) |
| `ADMIN_HOSTS` | Hôtes autorisés pour `/barber` (liste séparée par des virgules). **Obligatoire en production** : un hôte du déploiement de production |
| `LOGIN_*`, `SESSION_*`, `BOOKING_*` | Optionnels : seuils de sécurité (voir `lib/securityConfig.ts`) |
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
3. **Environment Variables** : ajoute les variables ci-dessus **séparément pour
   Production et Preview**, plus les 3 `VAPID_*` pour les notifications (Preview = sa propre base de test, voir
   `docs/audits/RELEASE_CHECKLIST.md`).
4. **Deploy**. Framework détecté automatiquement (Next.js).
5. Chaque `git push` redéploie le site.

---

## 🛡️ Sécurité & fiabilité (résumé technique)

- **Anti-double-booking au niveau BDD** : contrainte d'exclusion Postgres
  (`EXCLUDE USING gist`) sur `(barber, intervalle de temps)` pour les
  réservations `confirmed`, plus un verrou par barbier partagé avec la pose
  d'absences. La création passe par `create_booking_v2` (idempotente : un nouvel
  essai renvoie la même réservation).
- **Règles côté serveur** : jours/horaires/créneaux exactement ceux du formulaire
  (fenêtre de 14 jours, grille, heures passées refusées), prix et durée tirés de
  `config/site.ts`.
- **Service role key côté serveur uniquement** (routes API / `lib/supabase.ts`
  marqué `server-only`).
- **Connexion** : mot de passe ≥ 15 caractères haché en scrypt ; limite **partagée
  en base** par compte (5 essais / 15 min, blocage 15→30→60 min max) et par adresse ;
  refus si la base du limiteur ne répond pas.
- **Sessions** : jeton aléatoire en cookie `__Host-` httpOnly/Secure/SameSite=Strict,
  empreinte seule en base ; déconnexion, changement de mot de passe, compte
  désactivé ou rôle retiré = effet immédiat.
- **En-têtes** : CSP, anti-iframe, nosniff, HSTS ; pas d'en-tête `X-Powered-By`.
- **Fuseau horaire** : toute la logique de créneaux est en **`Africa/Tunis`**.
- **Anti-spam** : honeypot + limite par adresse réseau partagée en base
  (6 réservations / 10 min ; les clients d'un même wifi partagent ce quota ; ne
  bloque pas un spam distribué). Pas de plafond par numéro par défaut (une même
  personne peut réserver pour sa famille) ; plafond optionnel via
  `BOOKING_MAX_ACTIVE_PER_PHONE`.
- **Sauvegardes** : `scripts/db-backup.sh` (bash : WSL sous Windows) ; la
  restauration est atomique et vérifie les droits avant de valider.
- **Accessibilité** : labels, focus visibles, contrastes, pas de scroll horizontal,
  `prefers-reduced-motion` respecté.

---

## 🧱 Structure du projet

```
config/site.ts          → TOUT le contenu éditable
lib/                    → supabase, auth, slots, time, ics, validation, rateLimit
app/
  page.tsx              → page d'accueil (toutes les sections)
  barber/page.tsx       → espace barbier (login par mot de passe + dashboard)
  confidentialite/page.tsx → information sur les données des réservations (faits vérifiés uniquement)
  components/           → Hero, Stats, TikTokGrid, Barbers, Services, Booking, …
  api/
    availability/       → créneaux dispo
    book/               → créer une réservation
    barber/             → login, logout, bookings, action, block
supabase/migration.sql  → schéma + sécurité BDD
scripts/set-password.ts → hash d'un mot de passe barbier (npm run set-password -- <id>)
```

---

#3ebchi_style 💈 — *Let's shake things up* 🔥
