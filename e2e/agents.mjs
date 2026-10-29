// Agents IA (décision d'Anissa : « l'agent 1 est obligatoire, le 2 et le 3, c'est le lycée qui sélectionne ce qu'il veut ») :
// le lycée choisit ses agents et voit le montant ; Cap Admin prépare les mails, validés par le référent ou la gestion des PFMP ;
// Cap Partenaires propose des lieux de stage et relit le CV ; Cap Veille publie des alertes, chaque lycée décide.
// Sans clé d'IA, les agents répondent avec des textes d'exemple.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { BASE, ok, visible, session, fin } from "./outils.mjs";

/* ------------------- Le lycée choisit ses agents ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/organisation/agents");
let t = await ddfpt.textContent("main");
ok(t.includes("Agent 1 · Cap Admin") && t.includes("inclus") && t.includes("Agent 2 · Cap Veille") && t.includes("Agent 3 · Cap Partenaires"), "le lycée voit ses trois agents, Cap Admin inclus");
ok(t.includes("Formule actuelle : Les trois agents, 99 € par mois"), "et le montant de sa formule");
await ddfpt.uncheck("input[name=veille]");
await ddfpt.click("button:has-text('Enregistrer les agents')");
ok(await visible(ddfpt.getByText("le nouveau montant s'applique à partir du mois prochain")), "il retire Cap Veille");
await ddfpt.reload();
ok((await ddfpt.textContent("main")).includes("Cap Admin + Cap Partenaires, 79 € par mois") && await ddfpt.locator("nav a:has-text('Veille')").count() === 0, "le montant change, l'onglet Veille disparaît");
await ddfpt.goto(BASE + "/veille");
ok(ddfpt.url().endsWith("/organisation/agents"), "sans Cap Veille, pas d'alertes");
await ddfpt.check("input[name=veille]");
await ddfpt.click("button:has-text('Enregistrer les agents')");
await visible(ddfpt.getByText("Agents enregistrés"));

/* ------------------- Agent 1, Cap Admin : les mails à valider ------------------- */
await ddfpt.goto(BASE + "/mails-a-valider");
await ddfpt.click("button:has-text('Préparer les mails du jour')");
ok(await visible(ddfpt.getByText("Cap Admin a préparé 2 mail(s)")) && await visible(ddfpt.getByText("À relire (2)")), "Cap Admin repère l'élève sans stage à l'approche de sa période (et l'élève en difficulté)");
t = await ddfpt.textContent("main");
ok(t.includes("Inès HADDAD") && t.includes("Bonjour Inès,") && t.includes("Aucun responsable n'a de compte") && t.includes("texte d'exemple"), "le mail est rédigé, le prénom remis, le motif expliqué");
ok(t.includes("seront aussi prévenus : Paul MARTIN, Julien ROUSSEL") || t.includes("seront aussi prévenus : Julien ROUSSEL, Paul MARTIN"), "sans compte des responsables : le mail part à l'élève, son référent et le DDFPT seront prévenus");
await ddfpt.click("button:has-text('Préparer les mails du jour')");
ok(await visible(ddfpt.getByText("Cap Admin n'a trouvé aucun nouveau mail")), "il ne propose jamais deux fois le même mail");
await ddfpt.goto(BASE + "/");
ok((await ddfpt.textContent("main")).includes("mail(s) préparé(s) par Cap Admin à relire avant envoi"), "le tableau de bord le signale");

const benali = await session("s.benali");
await benali.goto(BASE + "/mails-a-valider");
ok((await benali.textContent("main")).includes("À relire (0)"), "un autre professeur ne voit pas ce mail");
const martin = await session("p.martin");
await martin.goto(BASE + "/mails-a-valider");
const mail = martin.locator(".mail-agent", { hasText: "Inès HADDAD" });
ok(await mail.count() === 1, "le professeur référent de la classe le voit");
await mail.locator("summary:has-text('Modifier')").click();
const corps = mail.locator("textarea[name=corps]");
await corps.fill((await corps.inputValue()).replace("Courage", "Je t'attends mardi en salle B12. Courage"));
await mail.locator("button:has-text('Enregistrer et envoyer')").click();
ok(await visible(martin.getByText("Mail envoyé à Inès HADDAD, avec vos modifications")), "il le modifie et l'envoie");
await ddfpt.goto(BASE + "/messages");
t = await ddfpt.textContent("main");
ok(t.includes("salle B12") && t.includes("Message préparé avec Cap Admin") && t.includes("relu par Paul MARTIN"), "le mail part avec la mention de l'agent et de la personne qui l'a relu");
ok(t.includes("Pour information : Ton stage commence") && t.includes("Pensez à créer les comptes de ses responsables"), "le DDFPT est prévenu que le mail est parti à l'élève");

// Un mail demandé depuis la fiche de l'élève, puis écarté.
await ddfpt.goto(BASE + "/eleves");
await Promise.all([ddfpt.waitForURL(/\/eleves\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('HADDAD')")]);
await ddfpt.click("summary:has-text('Préparer un mail avec Cap Admin')");
await ddfpt.fill("#mail-consigne", "Inès Haddad doit apporter son CV imprimé au lycée jeudi");
await ddfpt.click("button:has-text('Préparer le mail')");
ok(await visible(ddfpt.getByText("Cap Admin a préparé le mail")), "l'équipe demande un mail à Cap Admin depuis la fiche de l'élève");
await ddfpt.goto(BASE + "/mails-a-valider");
const demande = ddfpt.locator(".mail-agent", { hasText: "Demandé par Julien ROUSSEL" });
ok((await demande.textContent()).includes("Inès doit apporter son CV imprimé"), "le texte reprend la demande, avec le prénom remis");
await demande.locator("button:has-text('Ne pas envoyer')").click();
ok(await visible(ddfpt.getByText("Mail écarté")), "un mail peut être écarté");
await ddfpt.goto(BASE + "/organisation/agents");
ok(/Ce mois-ci : [1-9]\d* demande\(s\) sur 400 prévues/.test(await ddfpt.textContent("main")), "chaque demande compte dans le plafond du mois");

/* ------------------- Agent 3, Cap Partenaires : lieux de stage et CV ------------------- */
const ines = await session("ines.haddad");
await ines.goto(BASE + "/mon-stage");
await ines.click("button:has-text('Proposer des lieux de stage')");
ok(await visible(ines.getByText(/Cap Partenaires propose \d lieu\(x\) de stage/)) && await visible(ines.getByText("Lieux de stage proposés")), "Cap Partenaires propose des lieux de stage à l'élève");
t = await ines.textContent("main");
ok(t.includes("Lieux de stage proposés") && t.includes("Préparé avec Cap Partenaires") && !/fiable|note de partenariat/i.test(t), "avec une raison pour chacun, sans la note de partenariat");
await ines.click("summary:has-text('Faire relire mon CV')");
await ines.fill("textarea[name=texte]", "Inès HADDAD\n06 39 98 77 66\nines.h@exemple.fr\n12 rue des Lilas\nFormation\n2026-2027 : 2nde Bac Pro Métiers de la sécurité\nCompétences : ponctuelle, sens du contact\nCentres d'intérêt : boxe, lecture");
await ines.click("button:has-text('Relire')");
ok(await visible(ines.getByText("Cap Partenaires a relu le CV.")) && await visible(ines.getByText("Relecture du CV du")), "l'élève fait relire son CV");
t = await ines.textContent("main");
ok(t.includes("Tes coordonnées sont présentes") && t.includes("expériences ou stages"), "la relecture donne points forts et points à améliorer");

/* ------------------- Agent 2, Cap Veille, et l'administration de Cap PFMP ------------------- */
await ddfpt.goto(BASE + "/veille");
const exemple = ddfpt.locator(".panel", { hasText: "Exemple d'alerte de veille" });
ok(await exemple.locator("text=Nouvelle").count() === 1, "l'alerte de veille arrive chez le lycée");
await exemple.locator("button:has-text(\"C'est fait\")").first().click();
ok(await visible(ddfpt.getByText("Proposition notée comme faite.")), "le lycée décide de chaque proposition");

const admin = await session("admin");
ok(admin.url().endsWith("/admin") && await visible(admin.getByText(/Lycées \(\d+\)/)), "l'administration de Cap PFMP arrive sur sa page");
t = await admin.textContent("main");
ok(t.includes("Lycée professionnel de démonstration") && t.includes("Les trois agents · 99 € par mois"), "elle voit chaque lycée, sa formule et son montant");
ok(t.includes("À faire : La bonne boîte") && t.includes("francetravail.io"), "un rappel l'invite à s'inscrire à La bonne boîte");
await admin.fill("#t-complet", "109");
await admin.fill("#plafondEntreprises", "1");
await admin.click("button:has-text('Enregistrer les tarifs')");
ok(await visible(admin.getByText("Tarifs et plafonds enregistrés")), "elle fixe les montants et les plafonds");
await ines.reload();
await ines.click("button:has-text('Proposer de nouveaux lieux de stage')");
ok(await visible(ines.getByText("a atteint le nombre de demandes prévu pour ce mois (1)")), "au-delà du plafond, l'agent s'arrête jusqu'au mois suivant");

await admin.goto(BASE + "/admin/veille");
await admin.fill("#v-pages", "https://www.exemple.com/actualites");
await admin.click("button:has-text('Enregistrer les sources')");
ok(await visible(admin.getByText("Sources non officielles refusées")), "Cap Veille ne lit chaque semaine que des sources officielles");
await admin.fill("#v-pages", "https://www.education.gouv.fr/bo");
await admin.click("button:has-text('Enregistrer les sources')");
ok(await visible(admin.getByText("1 source(s) enregistrée(s)")), "l'administration choisit les pages lues chaque semaine");
await admin.click("button:has-text('Lire les sources maintenant')");
// Sans accès à Internet (parcours de test), Cap Veille le dit ; en ligne, il prépare les alertes à relire.
ok(await visible(admin.getByText(/Cap Veille (n'a pu lire aucune|a lu|a préparé)/)), "elle peut lancer la lecture tout de suite");
await admin.fill("#v-titre", "Texte d'essai sur les PFMP");
await admin.fill("#v-source", "https://www.exemple.com/texte");
await admin.fill("#v-texte", "Texte d'essai, fictif, pour vérifier le fonctionnement de la veille réglementaire de Cap PFMP. Il ne correspond à aucun texte officiel.");
await admin.click("button:has-text(\"Préparer l'alerte avec Cap Veille\")");
ok(await visible(admin.getByText("Cap Veille ne travaille qu'avec les sources officielles")), "Cap Veille refuse une source non officielle");
await admin.fill("#v-source", "https://www.education.gouv.fr/bulletin-officiel");
await admin.click("button:has-text(\"Préparer l'alerte avec Cap Veille\")");
ok(await visible(admin.getByText("Cap Veille a préparé l'alerte")), "Cap Veille prépare l'alerte à partir du texte officiel");
await admin.reload();
await admin.click("button:has-text(\"Publier l'alerte\")");
ok(await visible(admin.getByText(/Alerte publiée pour les lycées qui ont Cap Veille \([1-9]\d* mail/)), "l'administration la publie, la direction et la gestion des PFMP sont prévenues");
await ddfpt.goto(BASE + "/veille");
ok((await ddfpt.textContent("main")).includes("Texte d'essai sur les PFMP"), "elle arrive chez le lycée");

/* ------------------- Accès ------------------- */
await martin.goto(BASE + "/admin");
ok(!martin.url().includes("/admin"), "seule l'administration de Cap PFMP ouvre sa page");
await martin.goto(BASE + "/organisation/agents");
ok(!martin.url().includes("/organisation"), "seuls le DDFPT et la direction choisissent les agents");

await fin();
