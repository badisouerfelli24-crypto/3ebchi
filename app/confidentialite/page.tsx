import type { Metadata } from "next";
import { SITE, BARBERS } from "@/config/site";

/* Information sur les données des réservations.
   Uniquement des faits vérifiés dans le code de ce site (aucune promesse de
   durée de conservation, aucune mention légale inventée). Toute modification
   du fonctionnement (nouvelle donnée, nouveau prestataire, suppression
   automatique…) doit être reportée ici. */

export const metadata: Metadata = {
  title: "Confidentialité — 3EBCHI STYLE",
  description: "Quelles informations le site de réservation utilise, pourquoi, et comment nous contacter.",
};

const owner = BARBERS.find((b) => b.isOwner);
const ownerInstagram = owner?.socials?.find((s) => s.kind === "instagram")?.url;
const instagramHandle = ownerInstagram ? "@" + ownerInstagram.replace(/\/$/, "").split("/").pop() : null;

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 font-display text-xl font-black text-cyan">{children}</h2>;
}

export default function Confidentialite() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-14 leading-relaxed text-fg/80">
      <a href="/" className="text-sm text-fg/40 underline">
        ← Retour au site
      </a>
      <h1 className="mt-6 font-display text-4xl font-black text-fg">
        Confidentialité<span className="text-cyan">.</span>
      </h1>
      <p className="mt-3 text-muted">
        {SITE.name}, salon de coiffure à {SITE.city}. Cette page explique ce que le site fait des informations que tu
        donnes en réservant.
      </p>

      <H>Ce qu&apos;on enregistre</H>
      <p className="mt-2">
        Quand tu réserves : ton nom, ton numéro de téléphone, la note facultative que tu écris, le barbier, la
        prestation, la date et l&apos;heure choisies, et la référence de réservation.
      </p>

      <H>Pourquoi</H>
      <p className="mt-2">
        Uniquement pour gérer ton rendez-vous : le réserver, éviter qu&apos;un même créneau soit pris deux fois, te
        reconnaître au salon et, si besoin, te contacter par appel ou WhatsApp à propos de ce rendez-vous. Pas de
        publicité, pas de revente, pas de statistiques de visite ni de traceurs publicitaires.
      </p>

      <H>Qui y a accès</H>
      <p className="mt-2">
        Les barbiers du salon, avec un mot de passe personnel : chacun voit ses propres rendez-vous, le responsable voit
        l&apos;ensemble. Le site est hébergé par Vercel et les réservations sont stockées dans une base de données
        Supabase : ces prestataires techniques traitent les données pour faire fonctionner le site. Si un barbier
        t&apos;écrit sur WhatsApp, ce message passe aussi par WhatsApp.
      </p>

      <H>Sécurité</H>
      <p className="mt-2">
        Les échanges avec le site sont chiffrés (HTTPS) et l&apos;espace barbier est protégé par mot de passe. Pour
        limiter les abus (réservations en masse, essais de mots de passe), le site utilise une empreinte non lisible
        de l&apos;adresse réseau de ta connexion, effacée automatiquement par la suite. Comme tout hébergeur, Vercel peut
        conserver des journaux techniques (adresse IP, pages demandées).
      </p>

      <H>Combien de temps</H>
      <p className="mt-2">
        Aujourd&apos;hui, il n&apos;y a pas de suppression automatique des réservations : elles restent enregistrées
        jusqu&apos;à ce que le salon les supprime. Tu peux demander à tout moment la correction ou la suppression des
        tiennes.
      </p>

      <H>Cookies</H>
      <p className="mt-2">
        Le site public ne dépose aucun cookie. Seul l&apos;espace barbier utilise un cookie technique de connexion.
      </p>

      <H>Te contacter / nous contacter</H>
      <p className="mt-2">
        Pour annuler, consulter, corriger ou supprimer tes informations : passe au salon (
        <a href={SITE.mapsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
          itinéraire ↗
        </a>
        )
        {ownerInstagram && (
          <>
            {" "}ou écris à {owner?.name} sur Instagram (
            <a href={ownerInstagram} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
              {instagramHandle} ↗
            </a>
            )
          </>
        )}
        .
      </p>
    </main>
  );
}
