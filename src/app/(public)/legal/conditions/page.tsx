import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, ToProvide } from "../legal-page";
import {
  LEGAL_COMMISSION_LABEL,
  LEGAL_PRO_COMMISSION_LABEL,
  LEGAL_CONSUMPTION_THRESHOLD_LABEL,
  LEGAL_DELETION_GRACE_DAYS,
  LEGAL_DISPUTE_WINDOW_DAYS,
  LEGAL_LEARNER_RESPONSE_DAYS,
  LEGAL_TERMS_UPDATED_AT,
  LEGAL_TRAINER_SHARE_LABEL,
} from "@/lib/legal-terms";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description: "Les règles d'usage de NKAMVA : achats, accès, remboursements, publication.",
};

export default function ConditionsPage() {
  return (
    <LegalPage
      title="Conditions d'utilisation"
      lead="Ce que vous pouvez attendre de NKAMVA, et ce que NKAMVA attend de vous."
      updatedAt={LEGAL_TERMS_UPDATED_AT}
    >
      <h2>1. Objet</h2>
      <p>
        NKAMVA est une place de marché de ressources pédagogiques. Des formateurs y publient des
        cours vidéo, guides, kits et modèles ; des apprenants les achètent à l&apos;unité, en
        FCFA. NKAMVA n&apos;est pas l&apos;auteur des ressources : elle en assure la distribution,
        l&apos;encaissement et le service.
      </p>

      <h2>2. Compte</h2>
      <p>
        La création d&apos;un compte suppose d&apos;avoir 16 ans ou plus et de fournir une adresse
        e-mail valide, vérifiée par un code à usage unique. Vous êtes responsable de la
        confidentialité de votre mot de passe. Un compte suspendu perd l&apos;accès à la
        plateforme ; les achats déjà effectués ne sont pas effacés pour autant.
      </p>

      <h2>3. Achats et accès</h2>
      <p>
        Chaque ressource s&apos;achète à l&apos;unité, au prix fixé par son formateur et affiché
        toutes taxes comprises en FCFA. Aucun abonnement n&apos;est requis. L&apos;accès est
        ouvert dès la confirmation du paiement par l&apos;opérateur, et reste acquis sans limite
        de durée.
      </p>
      <p>
        Les frais de paiement s&apos;ajoutent au prix et sont à la charge de l&apos;acheteur. Ils
        sont calculés selon son pays et son moyen de paiement, sans marge pour NKAMVA, et le
        montant exact est affiché avant la confirmation. Le reçu sépare le prix, les frais et le
        total.
      </p>
      <p>
        En mobile money, la confirmation peut prendre quelques minutes. Aucun accès n&apos;est
        ouvert avant elle, et aucun montant n&apos;est dû si le paiement échoue.
      </p>

      <h2>4. Remboursement</h2>
      {/* Valeurs contractuelles, comme celles de l'article 5 : voir `lib/legal-terms`. */}
      <p>
        Une demande de remboursement se fait dans les {LEGAL_DISPUTE_WINDOW_DAYS} jours suivant
        l&apos;achat (pour un live, dans les {LEGAL_DISPUTE_WINDOW_DAYS} jours suivant la date
        prévue). Elle est intégralement remboursée, frais de paiement compris, quand la faute
        n&apos;est pas celle de l&apos;acheteur :
      </p>
      <ul>
        <li>accès non reçu et non rétabli par le support sous 48 h ;</li>
        <li>double paiement ou montant erroné ;</li>
        <li>
          live payant annulé et non reprogrammé dans les 7 jours, ou reprogrammé à une date qui
          ne convient pas à l&apos;acheteur ;
        </li>
        <li>contenu manifestement différent de sa description, après vérification par NKAMVA.</li>
      </ul>
      <p>
        Un simple changement d&apos;avis n&apos;est remboursable qu&apos;avant l&apos;accès au
        contenu : une ressource consultée en ligne à plus de {LEGAL_CONSUMPTION_THRESHOLD_LABEL}, ou
        un fichier téléchargé, ne l&apos;est plus. La décision, motivée, est rendue sous 72 heures
        ouvrées ; le remboursement intervient sous 5 jours ouvrés sur le moyen de paiement
        d&apos;origine, et l&apos;accès au produit est retiré. Au-delà de 2 remboursements en 3
        mois pour un même acheteur, la demande est examinée manuellement.
      </p>
      <p>
        Pendant l&apos;examen, l&apos;accès à la ressource est suspendu. Si la contestation
        n&apos;est pas retenue, il est rétabli. Si aucune réponse n&apos;est apportée à une
        demande de précision dans un délai de {LEGAL_LEARNER_RESPONSE_DAYS} jours, le dossier est clos et l&apos;accès
        rétabli.
      </p>
      <p>
        Ces conditions n&apos;écartent pas les droits que la loi applicable vous reconnaît par
        ailleurs.
      </p>

      <h2>5. Publication</h2>
      <p>
        Publier suppose une candidature examinée au préalable, avec pièce d&apos;identité,
        justificatif d&apos;expertise et vidéo de présentation. Le formateur garantit détenir les
        droits sur ce qu&apos;il publie et s&apos;engage à ce que la ressource livrée corresponde
        à sa description.
      </p>
      <p>
        {/* Valeurs contractuelles : elles ne suivent pas la configuration, elles
            se modifient avec le document. Voir `lib/legal-terms`. */}
        Sur le plan « Vous ne payez que quand vous vendez », NKAMVA retient{" "}
        {LEGAL_COMMISSION_LABEL} du prix fixé par le formateur ; {LEGAL_TRAINER_SHARE_LABEL}{" "}
        lui reviennent, crédités à chaque vente confirmée. Sur le plan Pro, la commission est de{" "}
        {LEGAL_PRO_COMMISSION_LABEL}, en plus de l&apos;abonnement mensuel. Les frais de paiement,
        payés par l&apos;acheteur, ne réduisent jamais la part du formateur. En cas de
        remboursement, la vente est annulée sur son solde et NKAMVA ne garde pas sa commission ;
        si la faute revient au formateur (live annulé, contenu non conforme), les frais de
        paiement non récupérables sont aussi à sa charge. Si son solde ne suffit pas, la somme
        est retenue sur ses prochaines ventes.
      </p>

      <h2>6. Contenus interdits</h2>
      <p>
        Sont notamment proscrits : les contenus contrefaisants, les contenus haineux ou
        discriminatoires, les contenus à caractère sexuel, ceux qui mettent en danger des mineurs,
        et toute promesse de résultat financier ou médical non étayée. Une ressource peut être
        retirée du catalogue à tout moment si elle contrevient à ces règles.
      </p>

      <h2>7. Suspension et résiliation</h2>
      <p>
        Vous pouvez supprimer votre compte à tout moment depuis votre profil. La suppression est
        différée de {LEGAL_DELETION_GRACE_DAYS} jours, pendant lesquels vous pouvez l&apos;annuler. Passé ce délai, vos
        données personnelles sont effacées ; vos écritures d&apos;achat sont conservées de façon
        anonymisée pour les besoins comptables.
      </p>

      <h2>8. Responsabilité</h2>
      <p>
        NKAMVA met en œuvre les moyens raisonnables pour assurer la disponibilité du service et
        l&apos;accès aux ressources achetées. Elle ne garantit pas que le contenu d&apos;une
        ressource produira un résultat déterminé.
      </p>

      <h2>9. Modification</h2>
      <p>
        Ces conditions peuvent évoluer. Toute modification substantielle est portée à votre
        connaissance avant son entrée en vigueur.
      </p>

      <h2>10. Droit applicable</h2>
      <p>
        Les présentes sont régies par <ToProvide>droit applicable</ToProvide> et, à défaut de
        résolution amiable, relèvent de <ToProvide>juridiction compétente</ToProvide>.
      </p>

      <h2>11. Contact</h2>
      <p>
        Pour toute question sur ces conditions,{" "}
        <Link href="/contact" className="font-semibold text-brand">
          écrivez au support
        </Link>
        .
      </p>
    </LegalPage>
  );
}
