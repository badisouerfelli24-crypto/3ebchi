/* Génère un hash bcrypt pour un PIN de barbier.
   -------------------------------------------------------------------------
   Usage :
     npm run hash-pin 1234                 -> affiche juste le hash
     npm run hash-pin 3ebchi 1234          -> affiche la requête SQL prête à coller

   Puis colle le hash/SQL dans Supabase (table barbers.pin_hash).
   Voir README.md section "Changer un PIN".
   ========================================================================= */

import bcrypt from "bcryptjs";

const args = process.argv.slice(2);

function usageAndExit(): never {
  console.error("Usage: npm run hash-pin <PIN>   ou   npm run hash-pin <barberId> <PIN>");
  process.exit(1);
}

let barberId: string | null = null;
let pin: string;

if (args.length === 1) {
  pin = args[0];
} else if (args.length === 2) {
  barberId = args[0];
  pin = args[1];
} else {
  usageAndExit();
}

if (!/^\d{4}$/.test(pin)) {
  console.error("❌ Le PIN doit faire exactement 4 chiffres.");
  process.exit(1);
}

const hash = bcrypt.hashSync(pin, 10);

console.log("");
console.log("✅ Hash bcrypt généré :");
console.log(hash);
console.log("");

if (barberId) {
  console.log("➡️  SQL à exécuter dans Supabase (SQL Editor) :");
  console.log(`update public.barbers set pin_hash = '${hash}' where id = '${barberId}';`);
  console.log("");
}
