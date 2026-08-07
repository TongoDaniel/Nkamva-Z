import type { Metadata } from "next";
import Link from "next/link";
import { getSettingNumber } from "@/lib/settings";
import { LegalPage, ToProvide } from "../legal-page";

// Le délai de réponse annoncé ici est le même que sur /contact, et il vit en
// base : deux pages qui promettent des délais différents seraient un
// engagement contradictoire, dans un document qui engage.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur, hébergeur et contacts de la plateforme NkamVa.",
};

export default async function MentionsPage() {
  const responseHours = await getSettingNumber("support.response_time_hours");

  return (
    <LegalPage
      title="Mentions légales"
      lead="Qui édite ce site, qui l'héberge, et comment nous joindre."
      updatedAt="1er août 2026"
    >
      <h2>Éditeur</h2>
      <p>
        NkamVa, plateforme de diffusion de ressources pédagogiques.
        <br />
        Raison sociale : <ToProvide>dénomination et forme juridique</ToProvide>
        <br />
        Siège social : <ToProvide>adresse complète</ToProvide>
        <br />
        Immatriculation : <ToProvide>numéro d&apos;immatriculation</ToProvide>
        <br />
        Capital social : <ToProvide>montant</ToProvide>
        <br />
        Numéro de TVA : <ToProvide>le cas échéant</ToProvide>
      </p>

      <h2>Directeur de la publication</h2>
      <p>
        <ToProvide>nom et qualité</ToProvide>
      </p>

      <h2>Contact</h2>
      <p>
        Support et réclamations :{" "}
        <Link href="/contact" className="font-semibold text-brand">
          formulaire de contact
        </Link>
        , réponse sous {responseHours} heures ouvrées.
        <br />
        Adresse électronique : <ToProvide>adresse de contact</ToProvide>
        <br />
        Téléphone : <ToProvide>numéro, le cas échéant</ToProvide>
      </p>

      <h2>Hébergement</h2>
      <p>
        Application : <ToProvide>hébergeur applicatif, raison sociale et adresse</ToProvide>
        <br />
        Fichiers et médias : <ToProvide>hébergeur de stockage objet</ToProvide>
        <br />
        Base de données : <ToProvide>hébergeur de la base</ToProvide>
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        La marque NkamVa, le logo et l&apos;interface du site sont la propriété de
        l&apos;éditeur. Les ressources pédagogiques diffusées restent la propriété de leurs
        auteurs : leur achat confère un droit d&apos;accès personnel, non une cession de droits.
        Leur reproduction ou leur rediffusion est interdite sans autorisation de l&apos;auteur.
      </p>

      <h2>Signalement</h2>
      <p>
        Pour signaler un contenu illicite ou une atteinte à vos droits, écrivez au support en
        précisant la ressource concernée et le fondement de votre demande. Les signalements sont
        examinés par l&apos;équipe de modération.
      </p>

      <h2>Documents liés</h2>
      <p>
        <Link href="/legal/conditions" className="font-semibold text-brand">
          Conditions d&apos;utilisation
        </Link>{" "}
        ·{" "}
        <Link href="/legal/confidentialite" className="font-semibold text-brand">
          Politique de confidentialité
        </Link>
      </p>
    </LegalPage>
  );
}
