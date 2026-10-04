/* Hachage des mots de passe admin : scrypt (primitive native de Node, sans
   dépendance), sel aléatoire de 16 octets par mot de passe, paramètres OWASP
   (N=2^17, r=8, p=1 ≈ 128 MiB, ~0,4 s mesurées localement).
   Format stocké : scrypt$v=1$n=<N>,r=<r>,p=<p>$<sel b64url>$<hash b64url>
   Aucun chiffrement réversible, aucun mot de passe en clair, aucun journal. */

import crypto from "crypto";
import { PASSWORD_MAX_BYTES, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./securityConfig";

const DEFAULT = { N: 2 ** 17, r: 8, p: 1 };
const KEYLEN = 32;
// Bornes acceptées à la lecture d'un hash (empêche un hash piégé de bloquer le serveur).
const MAX_N = 2 ** 20;
const MAX_MEM = 256 * 1024 * 1024; // mémoire max par calcul acceptée à la lecture

/* Mémoire : chaque calcul scrypt alloue 128·N·r octets (128 MiB avec les
   paramètres par défaut). Pour qu'une rafale de connexions simultanées ne
   puisse pas épuiser la mémoire d'une instance serveur, au plus
   HASH_CONCURRENCY calculs tournent en même temps (≈ 256 MiB au pire) ; les
   suivants attendent dans une file BORNÉE. File pleine => HashBusyError
   (la route répond 503, aucun calcul supplémentaire). Le limiteur partagé
   (lib/auth.ts) borne en plus le nombre total de tentatives par compte. */
const HASH_CONCURRENCY = 2;
const HASH_QUEUE_MAX = 16;
let running = 0;
const waiting: Array<() => void> = [];

export class HashBusyError extends Error {
  constructor() {
    super("password hashing busy");
    this.name = "HashBusyError";
  }
}

async function withHashSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= HASH_CONCURRENCY) {
    if (waiting.length >= HASH_QUEUE_MAX) throw new HashBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    running++;
  }
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next(); // le créneau passe directement au suivant
    else running--;
  }
}

/** Pour les tests : état de la file (calculs en cours, en attente). */
export function hashQueueState() {
  return { running, waiting: waiting.length, max: HASH_CONCURRENCY, queueMax: HASH_QUEUE_MAX };
}

function scrypt(pw: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return withHashSlot(
    () =>
      new Promise<Buffer>((resolve, reject) =>
        crypto.scrypt(pw.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem: 128 * N * r + 1024 * 1024 }, (err, key) =>
          err ? reject(err) : resolve(key)
        )
      )
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, DEFAULT.N, DEFAULT.r, DEFAULT.p);
  return `scrypt$v=1$n=${DEFAULT.N},r=${DEFAULT.r},p=${DEFAULT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

const FORMAT = /^scrypt\$v=1\$n=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]{16,})\$([A-Za-z0-9_-]{40,})$/;

/** Vérifie en temps constant. Retourne false pour tout hash absent ou mal formé. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const m = stored ? FORMAT.exec(stored) : null;
  if (!m) return false;
  const [N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!Number.isInteger(Math.log2(N)) || N < 2 ** 14 || N > MAX_N || r < 1 || r > 32 || p < 1 || p > 16) return false;
  if (128 * N * r > MAX_MEM) return false; // un hash anormal ne peut pas réclamer des Go de mémoire
  const expected = Buffer.from(m[5], "base64url");
  const got = await scrypt(password, Buffer.from(m[4], "base64url"), N, r, p);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

/* Hash factice : sert à garder un temps de réponse comparable quand un compte
   connu n'a pas (encore) de mot de passe ou est désactivé. Calculé une fois. */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  if (!dummy) dummy = hashPassword(crypto.randomBytes(24).toString("base64url"));
  return dummy;
}

/** Bornes appliquées AVANT tout calcul coûteux (requête de connexion). */
export function passwordWithinBounds(pw: unknown): pw is string {
  return (
    typeof pw === "string" &&
    pw.length > 0 &&
    [...pw].length <= PASSWORD_MAX_LENGTH &&
    Buffer.byteLength(pw, "utf8") <= PASSWORD_MAX_BYTES
  );
}

/* --------- Politique de création (outil de provisionnement) ---------
   NIST SP 800-63B-4 : longueur ≥ 15, pas de règles de composition, liste de
   refus (mots courants et termes propres au service). */
const SERVICE_TERMS = ["3ebchi", "ebchi", "barber", "barbier", "hajem", "hajema", "style", "achref", "brag", "baffi", "imed", "tunis", "tunisie", "coiffeur", "coiffure"];
const COMMON = ["password", "motdepasse", "azerty", "qwerty", "123456", "abcdef", "iloveyou", "admin", "welcome", "letmein", "soleil", "bonjour", "football", "clubafricain", "esperance"];

export function checkPasswordPolicy(pw: string, accountIds: string[] = []): string | null {
  const chars = [...pw];
  if (chars.length < PASSWORD_MIN_LENGTH) return `Au moins ${PASSWORD_MIN_LENGTH} caractères (une phrase de passe de 4 mots ou plus est idéale).`;
  if (chars.length > PASSWORD_MAX_LENGTH || Buffer.byteLength(pw, "utf8") > PASSWORD_MAX_BYTES) return `Au plus ${PASSWORD_MAX_LENGTH} caractères.`;
  if (new Set(chars).size < 5) return "Trop répétitif (ex. aaaa…, 1212…).";
  const norm = pw.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
  let rest = norm;
  for (const t of [...SERVICE_TERMS, ...COMMON, ...accountIds.map((s) => s.toLowerCase())]) rest = rest.split(t).join("");
  rest = rest.replace(/0123456789|123456789|12345678|1234567|123456|987654321|qwertyuiop|azertyuiop/g, "");
  if (rest.length < 10) return "Trop prévisible : évite le nom du salon, des barbiers, des mots courants et les suites de chiffres.";
  return null;
}
