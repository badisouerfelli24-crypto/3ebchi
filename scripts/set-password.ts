/* Définir / réinitialiser le mot de passe d'un barbier (espace /barber).
   -------------------------------------------------------------------------
   Usage :   npm run set-password -- <barberId>
             (ex. npm run set-password -- 3ebchi)

   - Le mot de passe est saisi de façon MASQUÉE (deux fois). Il n'est jamais
     passé en argument (il finirait dans l'historique du shell), jamais écrit
     sur disque, jamais affiché.
   - Entrée non interactive possible (pipe) : la 1re ligne lue sur stdin.
   - Le script NE SE CONNECTE À AUCUNE BASE. Il affiche seulement un bloc SQL
     (hash scrypt + révocation des sessions) à coller dans Supabase > SQL Editor.
   - Politique : ≥ 15 caractères, ≤ 128, pas de règles de composition, refus des
     mots courants / termes du salon (NIST SP 800-63B-4).
   ========================================================================= */

import readline from "readline";
import { BARBERS } from "../config/site";
import { checkPasswordPolicy, hashPassword } from "../lib/password";

const barberId = process.argv[2] || "";
const barber = BARBERS.find((b) => b.id === barberId);
if (!barber) {
  console.error(`Usage : npm run set-password -- <barberId>   (ids : ${BARBERS.map((b) => b.id).join(", ")})`);
  process.exit(1);
}

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => {
      if (!muted) out.output.write(s);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function readPiped(): Promise<string> {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.split(/\r?\n/)[0] || "";
}

(async () => {
  let pw: string;
  if (process.stdin.isTTY) {
    pw = await askHidden(`Nouveau mot de passe pour ${barber.name} : `);
    const again = await askHidden("Répète le mot de passe : ");
    if (pw !== again) {
      console.error("❌ Les deux saisies ne correspondent pas.");
      process.exit(1);
    }
  } else {
    pw = await readPiped();
  }

  const problem = checkPasswordPolicy(pw, BARBERS.flatMap((b) => [b.id, b.name]));
  if (problem) {
    console.error(`❌ ${problem}`);
    process.exit(1);
  }

  const hash = await hashPassword(pw);
  pw = "";

  const id = barber.id.replace(/'/g, "''");
  console.log("");
  console.log("-- ➡️  À exécuter dans Supabase > SQL Editor (ne pas partager ce bloc) :");
  // Bloc atomique : échoue (sans rien modifier) si le barbier n'existe pas en base.
  // Ne touche qu'à la ligne du barbier (son id et ses réservations restent liés).
  console.log("do $$");
  console.log("begin");
  console.log(`  update public.barbers set password_hash = '${hash}', password_changed_at = now(), active = true where id = '${id}';`);
  console.log(`  if not found then raise exception 'Barbier ${id} introuvable : rien n''a été modifié.'; end if;`);
  console.log(`  perform public.admin_sessions_revoke_all('${id}');   -- déconnecte ses anciennes sessions`);
  console.log(`  delete from public.rate_limits where key = 'login:acct:${id}';   -- lève un éventuel blocage`);
  console.log(`  raise notice 'Mot de passe de ${id} enregistré ; anciennes sessions révoquées.';`);
  console.log("end $$;");
  console.log("");
  console.log("-- Ce bloc contient un hash de mot de passe : ne le colle nulle part ailleurs, puis efface l'écran (cls / clear).");
})();
