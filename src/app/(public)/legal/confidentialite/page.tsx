import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, ToProvide } from "../legal-page";
import {
  LEGAL_DELETION_GRACE_DAYS,
  LEGAL_DOCUMENT_RETENTION_DAYS,
  LEGAL_INVITATION_RETENTION_DAYS,
  LEGAL_OTP_TTL_MINUTES,
  LEGAL_PRIVACY_UPDATED_AT,
} from "@/lib/legal-terms";

export const metadata: Metadata = {
  title: "Confidentialité",
  description:
    "Quelles données NKAMVA collecte, pourquoi, combien de temps, et comment les récupérer ou les effacer.",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Confidentialité"
      lead="Quelles données nous détenons, pourquoi, combien de temps, et ce que vous pouvez en faire."
      updatedAt={LEGAL_PRIVACY_UPDATED_AT}
    >
      <h2>1. Responsable du traitement</h2>
      <p>
        <ToProvide>raison sociale, siège, représentant légal</ToProvide>. Pour toute question
        relative à vos données : <ToProvide>adresse de contact dédiée</ToProvide>, ou via le{" "}
        <Link href="/contact" className="font-semibold text-brand">
          formulaire de contact
        </Link>
        .
      </p>

      <h2>2. Données collectées</h2>
      <h3>Compte</h3>
      <p>
        Adresse e-mail, nom complet, nom d&apos;usage, mot de passe sous forme d&apos;empreinte
        irréversible, et si vous les renseignez : téléphone, pays, biographie. L&apos;adresse
        e-mail est vérifiée par un code à usage unique.
      </p>
      <h3>Achats</h3>
      <p>
        Ressource achetée, montant, moyen de paiement, identifiant de transaction chez
        l&apos;opérateur, statut et date. NKAMVA ne reçoit ni ne conserve vos coordonnées
        bancaires : elles sont saisies chez l&apos;opérateur de paiement.
      </p>
      <h3>Utilisation</h3>
      <p>
        Progression de lecture et téléchargements effectués. Ces données servent à reprendre votre
        lecture où vous l&apos;aviez laissée, et à instruire une éventuelle demande de
        remboursement.
      </p>
      <h3>Candidature formateur</h3>
      <p>
        Pièce d&apos;identité, justificatif d&apos;expertise et vidéo de présentation. Ces pièces
        ne sont consultables que par l&apos;équipe de modération, chaque consultation étant
        journalisée.
      </p>
      <h3>Invitations à une communauté</h3>
      <p>
        Le formateur qui anime une communauté peut y inviter une personne en saisissant son
        adresse e-mail, que cette personne ait un compte NKAMVA ou non. Nous conservons alors
        cette adresse, la communauté concernée, les mois d&apos;adhésion offerts le cas échéant,
        et les dates d&apos;envoi, d&apos;expiration, d&apos;acceptation ou d&apos;annulation de
        l&apos;invitation.
      </p>
      <p>
        L&apos;adresse ne sert qu&apos;à envoyer l&apos;invitation et à la rattacher au compte
        créé avec cette même adresse. Elle n&apos;est utilisée à aucune autre fin, et jamais à des
        fins commerciales. Si vous avez reçu une invitation sans avoir de compte, vous pouvez
        nous demander d&apos;en effacer l&apos;adresse sans attendre, via le{" "}
        <Link href="/contact" className="font-semibold text-brand">
          formulaire de contact
        </Link>
        .
      </p>

      <h2>3. Bases légales</h2>
      <ul>
        <li>
          <b>Exécution du contrat</b> : compte, achats, accès aux ressources, service client.
        </li>
        <li>
          <b>Obligation légale</b> : conservation des écritures comptables.
        </li>
        <li>
          <b>Intérêt légitime</b> : sécurité des comptes, prévention de la fraude et des abus ;
          transmission à une personne de l&apos;invitation qu&apos;un formateur lui adresse.
        </li>
      </ul>

      <h2>4. Durées de conservation</h2>
      <ul>
        <li>
          <b>Compte</b> : jusqu&apos;à votre demande de suppression, puis {LEGAL_DELETION_GRACE_DAYS} jours de délai de
          rétractation avant effacement.
        </li>
        <li>
          <b>Pièces de candidature formateur</b> : {LEGAL_DOCUMENT_RETENTION_DAYS} jours après la décision, puis effacement du
          fichier et de sa référence.
        </li>
        <li>
          <b>Écritures d&apos;achat</b> : conservées de façon anonymisée après effacement du
          compte, pour les besoins comptables et fiscaux.
        </li>
        <li>
          <b>Adresses des personnes invitées</b> : {LEGAL_INVITATION_RETENTION_DAYS} jours après
          l&apos;acceptation, l&apos;annulation ou l&apos;expiration de l&apos;invitation, puis
          effacement de l&apos;adresse. L&apos;invitation elle-même est conservée sans elle,
          parce qu&apos;elle justifie l&apos;adhésion à laquelle elle a pu mener.
        </li>
        <li>
          <b>Codes à usage unique</b> : {LEGAL_OTP_TTL_MINUTES} minutes, puis inutilisables.
        </li>
      </ul>

      <h2>5. Destinataires et sous-traitants</h2>
      <p>
        Vos données ne sont ni vendues ni cédées. Elles sont traitées par les prestataires
        strictement nécessaires au service :
      </p>
      <ul>
        <li>opérateurs de paiement mobile money et carte bancaire, pour l&apos;encaissement ;</li>
        <li>prestataire d&apos;envoi d&apos;e-mails, pour les messages transactionnels ;</li>
        <li>hébergeur de fichiers, pour les ressources et les pièces justificatives ;</li>
        <li>hébergeur applicatif, pour la plateforme elle-même.</li>
      </ul>
      <p>
        La liste nominative et les pays d&apos;hébergement figurent en{" "}
        <ToProvide>annexe sous-traitants</ToProvide>.
      </p>

      <h2>6. Ce que voit un formateur</h2>
      <p>
        Un formateur ne voit ni votre identité ni le détail que vous rédigez lorsque vous
        contestez un achat. Il est informé de la catégorie du motif et de la ressource concernée,
        rien de plus. Réciproquement, les éléments qu&apos;il transmet à la modération ne vous
        sont pas communiqués.
      </p>

      <h2>7. Vos droits</h2>
      <p>
        Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de
        limitation, d&apos;opposition et de portabilité. Deux d&apos;entre eux s&apos;exercent
        directement depuis votre profil, onglet « Mes données » :
      </p>
      <ul>
        <li>
          <b>Récupérer vos données</b> : un fichier JSON complet est produit à la demande et
          téléchargé immédiatement. Il comprend les invitations que vous avez envoyées et celles
          que vous avez reçues.
        </li>
        <li>
          <b>Supprimer votre compte</b> : effacement programmé à {LEGAL_DELETION_GRACE_DAYS} jours, annulable par vous
          jusqu&apos;au dernier jour.
        </li>
      </ul>
      <p>
        Pour les autres, écrivez-nous. Vous pouvez également saisir l&apos;autorité de contrôle
        compétente : <ToProvide>autorité de protection des données</ToProvide>.
      </p>

      <h2>8. Sécurité</h2>
      <p>
        Les mots de passe sont stockés sous forme d&apos;empreinte argon2id, jamais en clair. Les
        fichiers ne sont accessibles que par des liens signés de courte durée. Un changement de
        mot de passe déconnecte immédiatement toutes les sessions ouvertes.
      </p>

      <h2>9. Cookies</h2>
      <p>
        NKAMVA n&apos;utilise que les cookies nécessaires au fonctionnement : maintien de votre
        session et protection contre la falsification de requêtes. Aucun cookie publicitaire ni de
        mesure d&apos;audience tierce n&apos;est déposé, ce qui explique l&apos;absence de
        bandeau de consentement.
      </p>
    </LegalPage>
  );
}
