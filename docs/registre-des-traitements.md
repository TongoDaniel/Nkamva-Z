# Registre des activités de traitement — NKAMVA

> **Brouillon du 13 août 2026.** Ce registre est **dérivé du code**, pas déclaré à
> partir d'intentions : chaque catégorie de données, chaque durée et chaque
> destinataire ci-dessous renvoie au fichier qui l'écrit. C'est ce qui en fait un
> document vérifiable — et ce qui le rend faux le jour où le code change sans lui.
>
> Il répond à l'obligation de tenue du registre posée par la **loi camerounaise
> n° 2024/017 du 23 décembre 2024** relative à la protection des données à
> caractère personnel, dont la période de mise en conformité s'est achevée le
> **23 juin 2026**. Il n'a **pas** été relu par un conseil : les qualifications
> juridiques (base légale, durées légales de conservation, formalités auprès de
> l'APDP) sont des propositions, pas des conclusions.
>
> Les mentions **`[À COMPLÉTER]`** ne sont pas des oublis : ce sont les
> informations que le code ne porte pas et que seul le responsable de traitement
> peut fournir.

---

## 1. Le responsable du traitement

| | |
|---|---|
| Raison sociale | `[À COMPLÉTER]` |
| Forme juridique et RCCM | `[À COMPLÉTER]` |
| Siège social | `[À COMPLÉTER]` |
| Représentant légal | `[À COMPLÉTER]` |
| Point de contact « données personnelles » | `[À COMPLÉTER]` — une adresse dédiée, publiée dans la politique de confidentialité |
| Correspondant / DPO désigné | `[À COMPLÉTER]` — la loi ne l'impose pas systématiquement ; à trancher avec le conseil |

**Nature de l'activité.** Place de marché de formation en ligne : des apprenants
achètent des ressources et adhèrent à des communautés animées par des
formateurs, avec sessions en direct, messagerie et versement des revenus aux
formateurs.

---

## 2. Vue d'ensemble des traitements

Treize traitements, regroupés par finalité. Le détail de chacun suit.

| N° | Traitement | Base légale proposée | Données sensibles |
|---|---|---|---|
| T1 | Comptes et authentification | Exécution du contrat | — |
| T2 | Catalogue, achats et accès aux ressources | Exécution du contrat | — |
| T3 | Adhésions aux communautés | Exécution du contrat | — |
| T4 | Candidature formateur et vérification d'identité | Obligation légale + contrat | **Oui** (pièce d'identité) |
| T5 | Moyens de paiement et versements | Exécution du contrat + obligation légale | **Oui** (coordonnées bancaires) |
| T6 | Facturation, portefeuille et comptabilité | Obligation légale | — |
| T7 | Litiges, remboursements et support | Exécution du contrat | — |
| T8 | Sessions live et replays | Exécution du contrat | **Oui** (voix et image) |
| T9 | Messagerie et fils de communauté | Exécution du contrat | — |
| T10 | Invitations aux communautés | Intérêt légitime | — |
| T11 | Modération, signalements et sanctions | Intérêt légitime | — |
| T12 | Journal d'audit et notifications | Intérêt légitime + obligation légale | — |
| T13 | Informations sur l'abonnement formateur | Consentement (opt-out) | — |

---

## 3. Le détail, traitement par traitement

### T1 — Comptes et authentification

| | |
|---|---|
| **Finalité** | Créer un compte, prouver la maîtrise d'une adresse e-mail, ouvrir et couper les sessions, protéger l'accès. |
| **Base légale** | Exécution du contrat (conditions générales d'utilisation). La double authentification et la limitation de débit relèvent de l'intérêt légitime à la sécurité. |
| **Personnes concernées** | Apprenants, formateurs, administrateurs. |
| **Catégories de données** | Adresse e-mail, empreinte de mot de passe (argon2id), identifiant Google le cas échéant, nom complet, nom d'usage, téléphone, pays, avatar, biographie, rôle, secret TOTP **chiffré au repos**, codes de récupération, horodatage de validité des sessions. |
| **Données techniques** | **Adresse IP** des requêtes non authentifiées, utilisée comme clé de limitation de débit (`getRateLimitIdentifier`, `src/lib/rate-limit.ts`). En mémoire, jamais écrite en base. |
| **Sources** | La personne elle-même, ou Google lors d'une connexion fédérée. |
| **Destinataires** | Resend (envoi des codes de vérification). |
| **Conservation** | Compte : tant qu'il est ouvert. Codes de vérification : **10 minutes**, 5 tentatives (`OTP_TTL_MS`, `OTP_MAX_ATTEMPTS`). Après demande de suppression : **30 jours** de grâce (`DELETION_GRACE_DAYS`), puis anonymisation. |
| **Code** | `prisma/schema.prisma` (`User`, `EmailOtp`, `RecoveryCode`), `src/lib/auth.ts`, `src/lib/otp.ts`, `src/lib/two-factor.ts` |

> **À vérifier avec le conseil :** l'IP est une donnée personnelle. Elle n'est ici
> ni journalisée ni conservée, mais la politique de confidentialité doit le dire.

### T2 — Catalogue, achats et accès aux ressources

| | |
|---|---|
| **Finalité** | Vendre des ressources à l'unité, en donner l'accès, mesurer la consommation — cette dernière servant de preuve dans un litige (arbitrage 14). |
| **Base légale** | Exécution du contrat. |
| **Personnes concernées** | Apprenants. |
| **Catégories de données** | Achats (montant, fournisseur, identifiant de transaction, statut, remboursement), consultation par ressource (secondes visionnées, téléchargement et sa date, dernière consultation), favoris. |
| **Destinataires** | Stripe ou PawaPay selon le moyen de paiement ; le formateur voit ses ventes de façon agrégée, jamais le détail de consultation d'une personne nommée. |
| **Conservation** | Écritures d'achat : durée légale comptable — `[À COMPLÉTER]`, à confirmer au regard de l'acte uniforme OHADA. Elles **survivent à l'anonymisation** du compte (`onDelete: Restrict`). |
| **Code** | `Purchase`, `CourseView`, `Favorite` ; `src/lib/purchases.ts`, `src/lib/access.ts` |

### T3 — Adhésions aux communautés

| | |
|---|---|
| **Finalité** | Ouvrir, renouveler et fermer une adhésion mensuelle ; calculer l'accès résiduel après le départ (arbitrages 34, 44, 48). |
| **Base légale** | Exécution du contrat. |
| **Catégories de données** | Périodes d'adhésion, statut, moyen de paiement utilisé, date de résiliation, bannissement éventuel. **L'historique des périodes est conservé** — c'est lui qui détermine à quoi un ancien membre garde droit. |
| **Conservation** | Tant que le compte existe : la ligne close reste nécessaire au calcul d'accès. |
| **Code** | `CommunitySubscription` ; `src/lib/memberships.ts` |

### T4 — Candidature formateur et vérification d'identité ⚠️

| | |
|---|---|
| **Finalité** | Vérifier l'identité d'un formateur avant de lui ouvrir un espace de vente et de lui verser des fonds. |
| **Base légale** | Obligation légale (connaissance du client, lutte contre le blanchiment) et exécution du contrat. **À faire qualifier :** l'obligation KYC applicable dépend de la qualification retenue au titre du règlement CEMAC sur les services de paiement. |
| **Catégories de données** | **Pièce d'identité** (image), diplôme, vidéo de présentation, extrait RCCM et preuve de représentation légale pour un compte d'entreprise ; nom légal vérifié saisi par la Modération ; motifs de refus. |
| **Sensibilité** | Une pièce d'identité est la donnée la plus exposée du système. Elle n'est **jamais** accessible à l'administration Finances (décision 21) : la séparation est structurelle, pas seulement respectée. |
| **Destinataires** | Stockage objet (Cloudflare R2) ; administrateurs Modération et Super-admin uniquement. Chaque consultation est journalisée (`TRAINER_DOCUMENT_VIEW`). |
| **Conservation** | **90 jours après la décision**, puis purge automatique (`DOCUMENT_RETENTION_DAYS`, job `TRAINER_DOCUMENT_PURGE`). Une fois purgés, un dossier ne peut plus être rouvert — `REOPEN_IMPOSSIBLE`. |
| **Code** | `TrainerDocument`, `TrainerApplication` ; `src/lib/trainer-documents.ts` |

### T5 — Moyens de paiement et versements ⚠️

| | |
|---|---|
| **Finalité** | Verser au formateur la part qui lui revient, et s'assurer que le compte destinataire est bien le sien. |
| **Base légale** | Exécution du contrat, obligation légale. |
| **Catégories de données** | IBAN et BIC, ou opérateur et numéro mobile money ; nom du titulaire ou dénomination sociale ; nom légal vérifié au moment de la création ; **instantanés de l'e-mail et du téléphone** du formateur à la date de création (`trainerEmailSnapshot`, `trainerPhoneSnapshot`) ; historique des refus. |
| **Destinataires** | PawaPay (mobile money), établissement bancaire `[À COMPLÉTER]` pour les virements ; administration Finances et Super-admin. |
| **Conservation** | Un moyen archivé est conservé pour l'audit des versements — durée à aligner sur la durée comptable, `[À COMPLÉTER]`. |
| **Code** | `PayoutMethod`, `Payout` ; `src/lib/payout-methods.ts`, `src/lib/payouts.ts` |

> **Point à documenter dans la politique de confidentialité :** l'instantané de
> téléphone est conservé pour documenter le dossier, et **n'est plus utilisé pour
> notifier** (arbitrage 100).

### T6 — Facturation, portefeuille et comptabilité

| | |
|---|---|
| **Finalité** | Tenir le solde du formateur, facturer l'abonnement de plateforme, produire les factures. |
| **Base légale** | Obligation légale (comptabilité). |
| **Catégories de données** | Soldes et mouvements de portefeuille, périodes d'abonnement facturées, montants consentis, factures nominatives, taux de change appliqués. |
| **Conservation** | Durée légale comptable — `[À COMPLÉTER]`. Ces écritures **survivent à la personne** : c'est la raison pour laquelle la suppression de compte est une anonymisation et non une suppression (décision 90). |
| **Code** | `Wallet`, `WalletDebit`, `SubscriptionCharge`, `Invoice` ; `src/lib/wallet.ts`, `src/lib/invoices.ts` |

### T7 — Litiges, remboursements et support

| | |
|---|---|
| **Finalité** | Instruire une contestation d'achat, décider d'un remboursement, tracer la décision. |
| **Base légale** | Exécution du contrat ; constatation et exercice de droits en justice. |
| **Catégories de données** | Motif (catégorie) et précisions rédigées librement, échanges entre l'apprenant et le support, instantané de consommation figé à l'ouverture, pièces jointes, décision et sa motivation. |
| **Cloisonnement** | Le formateur voit le motif catégoriel et le titre de la ressource, **jamais le texte libre** de l'apprenant (décision 19) — le filtrage est fait à la requête, pas à l'affichage. |
| **Conservation** | Durée du litige, puis conservation avec les écritures comptables auxquelles il se rattache. `[À COMPLÉTER]` |
| **Code** | `Dispute`, `DisputeMessage`, `SupportTicket` ; `src/lib/disputes.ts` |

### T8 — Sessions live et replays ⚠️

| | |
|---|---|
| **Finalité** | Tenir des séances en visioconférence et en conserver l'enregistrement pour les membres. |
| **Base légale** | Exécution du contrat. **À faire qualifier :** l'enregistrement est automatique et sans décision au lancement (arbitrage 38) ; l'information préalable des participants doit être explicite à l'entrée en salle. |
| **Catégories de données** | **Voix et image** des participants, messages du salon, présence et durée, main levée, place sur la scène. |
| **Destinataires** | LiveKit (transport temps réel) ; Mux **uniquement si `REPLAY_RECORDER=MUX`** — sinon l'enregistrement reste dans le stockage objet. |
| **Conservation** | Replays : **24 mois** après la date du live (`REPLAY_RETENTION_MONTHS`), puis suppression de l'objet et de ses métadonnées (job `REPLAY_PURGE`). Préavis au formateur à J-30. Le salon reste attaché au replay (arbitrage 42). |
| **Code** | `LiveSession`, `LiveParticipant`, `LiveMessage`, `Replay` ; `src/lib/lives.ts`, `src/lib/livekit.ts` |

> **À corriger avant dépôt :** vérifier que l'écran d'entrée en salle annonce
> l'enregistrement de façon non équivoque, et que la politique de
> confidentialité le mentionne.

### T9 — Messagerie et fils de communauté

| | |
|---|---|
| **Finalité** | Permettre l'échange entre un membre et l'animateur de sa communauté, et la discussion collective. |
| **Base légale** | Exécution du contrat. |
| **Catégories de données** | Contenu des messages, auteur, horodatage, état de lecture. |
| **Conservation** | Le fil reste lisible après la fin de l'adhésion (arbitrage 39) : l'écriture cesse, la conservation continue tant que le compte existe. |
| **Code** | `Conversation`, `Message`, `CommunityPost`, `CommunityPostReply` ; `src/lib/messaging.ts` |

### T10 — Invitations aux communautés

| | |
|---|---|
| **Finalité** | Permettre à un formateur d'inviter quelqu'un, y compris une personne **qui n'a pas de compte**. |
| **Base légale** | Intérêt légitime de l'émetteur. C'est le traitement le plus délicat du registre : il stocke l'adresse d'un tiers qui n'a rien demandé. |
| **Catégories de données** | Adresse e-mail de l'invité, émetteur, communauté, nature de l'invitation, état. |
| **Garanties déjà en place** | Aucun usage marketing, aucune réutilisation, aucune énumération possible (le formateur ne voit **qu'un statut d'invitation**, jamais si l'adresse correspond à un compte — arbitrage 86). |
| **Conservation** | **90 jours après l'état terminal** (`INVITATION_RETENTION_DAYS`), puis l'adresse est effacée et la ligne anonymisée (job `INVITATION_PURGE`). L'attribution survit, l'adresse non. |
| **Code** | `CommunityInvitation` ; `src/lib/invitations.ts` |

### T11 — Modération, signalements et sanctions

| | |
|---|---|
| **Finalité** | Traiter les signalements, retirer un contenu illicite, restreindre ou fermer un compte. |
| **Base légale** | Intérêt légitime, et obligation légale selon la nature du contenu. |
| **Catégories de données** | Auteur du signalement, cible, motif, précisions, décision et motivation, niveau de sanction et son motif. |
| **Conservation** | Le signalement documente ce qui s'est passé **même si la cible a disparu** : conservé au-delà de l'objet visé. Durée à fixer — `[À COMPLÉTER]`. |
| **Code** | `Report`, `User.sanctionLevel` ; `src/lib/reports.ts`, `src/lib/user-sanctions.ts` |

### T12 — Journal d'audit et notifications

| | |
|---|---|
| **Finalité** | Prouver qui a fait quoi sur les décisions sensibles ; informer les personnes des événements qui les concernent. |
| **Base légale** | Intérêt légitime à la redevabilité ; obligation légale pour les décisions financières. |
| **Catégories de données** | Auteur, rôle, action, objet visé, métadonnées de contexte, horodatage. Notifications : titre, corps, lien, date de lecture. |
| **Particularité** | Le journal **n'expose aucune action de modification** : un journal qu'on peut retoucher ne prouve rien. Sa lecture est réservée au Super-admin (décision 7). |
| **Conservation** | **Trois régimes** (job hebdomadaire `AUDIT_LOG_PURGE`, `src/lib/jobs/purge-audit-log.ts`) : traces de machine **12 mois**, vie ordinaire de la plateforme **36 mois**, et décisions financières, d'identité et de sanction **conservées** — leur durée est celle des écritures comptables, qui reste `[À COMPLÉTER]`. Le compte rendu du job publie le nombre de lignes conservées à ce titre. |
| **Code** | `AuditLog`, `Notification` ; `src/lib/audit.ts` |

### T13 — Informations sur l'abonnement formateur

| | |
|---|---|
| **Finalité** | Annoncer un changement de grille tarifaire et rappeler l'échéance qui l'applique. |
| **Base légale** | Consentement, matérialisé par un réglage désactivable (`User.subscriptionNoticeEmails`). |
| **Limite explicite** | Ce réglage **ne coupe pas** les e-mails dont le compte a besoin pour fonctionner — code de vérification, facture, impayé, litige, suppression. Un réglage capable de les éteindre transformerait une préférence de confort en perte de droits. |
| **Code** | `src/lib/notification.ts` (`notifyWithEmail`), `src/lib/pricing.ts` |

---

## 4. Sous-traitants et transferts hors du Cameroun

**C'est la section qui commande la demande d'autorisation auprès de l'APDP.**
Tous les sous-traitants ci-dessous sont situés hors du Cameroun : la totalité des
traitements donne donc lieu à un transfert transfrontalier.

| Sous-traitant | Rôle | Données transmises | Localisation | Statut |
|---|---|---|---|---|
| **Supabase** (PostgreSQL) | Base de données — l'intégralité des traitements T1 à T13 | Toutes | **Francfort, Allemagne** (`aws-1-eu-central-1`) | Établi par la configuration |
| **Cloudflare R2** | Stockage des fichiers : pièces d'identité, contenus, pièces jointes, replays | T4, T2, T7, T8 | `[À CONFIRMER]` — dépend de `AWS_REGION` et de la juridiction du seau | À confirmer |
| **Resend** | E-mail transactionnel | Adresse e-mail, nom, contenu du message | `[À CONFIRMER]` | À confirmer |
| **Stripe** | Encaissement par carte, chargebacks | Identité de l'acheteur, montant, moyen de paiement | `[À CONFIRMER]` | À confirmer |
| **PawaPay** | Mobile money : encaissements, remboursements, versements | Numéro mobile money, nom, montant | `[À CONFIRMER]` | À confirmer |
| **LiveKit** | Transport temps réel des séances | Voix, image, identité de session | `[À CONFIRMER]` | À confirmer |
| **Mux** | Enregistrement et rediffusion — **inactif par défaut** depuis l'arbitrage 94 | Voix, image | `[À CONFIRMER]` | À confirmer, et sans objet tant que `REPLAY_RECORDER` n'est pas posé |
| Hébergement applicatif | Exécution du serveur | Toutes, en transit | `[À COMPLÉTER]` | À documenter |

**Ce qu'il faut réunir pour chacun**, au titre de l'autorisation de transfert :

1. l'identité et la localisation exacte du sous-traitant ;
2. les catégories de données transférées et la finalité ;
3. le **contrat de sous-traitance** (ou les clauses des conditions du
   fournisseur qui en tiennent lieu) ;
4. l'appréciation du niveau de protection du pays destinataire.

L'écran `/admin/integrations` liste déjà les fournisseurs, leur objet et l'état
réel de leur configuration : c'est la source à jour pour cette section.

---

## 5. Durées de conservation — récapitulatif

| Donnée | Durée | Mécanisme | Constante |
|---|---|---|---|
| Code de vérification e-mail | 10 minutes, 5 tentatives | Expiration | `OTP_TTL_MS` |
| Pièces d'identité et documents de candidature | 90 jours après décision | Job quotidien | `DOCUMENT_RETENTION_DAYS` |
| Adresse d'une personne invitée | 90 jours après état terminal | Job quotidien | `INVITATION_RETENTION_DAYS` |
| Compte après demande de suppression | 30 jours, puis anonymisation | Job quotidien | `DELETION_GRACE_DAYS` |
| Replays de séances | 24 mois après la date du live | Job quotidien | `REPLAY_RETENTION_MONTHS` |
| Espace formateur dormant | 24 mois | Job quotidien | `DORMANT_SPACE_MONTHS` |
| Pièces jointes non rattachées | Expiration courte | Job quotidien | `PendingAttachment` |
| Écritures comptables | Durée légale | Aucun — conservation volontaire | `[À COMPLÉTER]` |
| Journal d'audit — traces de machine | 12 mois | Job hebdomadaire | `AUDIT_TECHNICAL_RETENTION_MONTHS` |
| Journal d'audit — vie ordinaire | 36 mois | Job hebdomadaire | `AUDIT_DEFAULT_RETENTION_MONTHS` |
| Journal d'audit — décisions financières et d'identité | Conservées | Exclues de la purge | `AUDIT_PROTECTED_PREFIXES` |

**L'anonymisation, et non la suppression.** Un compte effacé perd son e-mail
(remplacé par une adresse `@nkamva.invalid` unique), son empreinte de mot de
passe, son identifiant Google, ses noms, téléphone, pays, avatar, biographie et
le motif de sa suspension. Les écritures financières survivent, rattachées à un
compte devenu anonyme. C'est précisément pourquoi la suppression est refusée tant
qu'une situation reste ouverte au nom de la personne — solde non vidé, versement
en vol, ressources publiées, communauté active, litige en cours (décision 90).

---

## 6. Droits des personnes

| Droit | Comment il s'exerce aujourd'hui | État |
|---|---|---|
| Accès et portabilité | Export depuis « Profil & paramètres » — profil, achats, consultations, notifications, adhésions, journal de ses propres actions | ✅ implémenté |
| Effacement | Demande depuis le profil, 30 jours de grâce annulables, puis anonymisation | ✅ implémenté |
| Rectification | Modification directe du profil | ✅ implémenté |
| Opposition à la prospection | Réglage `subscriptionNoticeEmails` | ✅ implémenté |
| Limitation | `[À COMPLÉTER]` — aucun mécanisme dédié | ❌ à instruire |
| Réclamation auprès de l'APDP | Mention à ajouter à la politique de confidentialité | ❌ à écrire |

---

## 7. Mesures de sécurité

- **Mots de passe** hachés en argon2id ; jamais stockés ni journalisés en clair.
- **Double authentification** par application (TOTP), secret chiffré au repos.
  Choisie plutôt que le SMS : la plateforme porte des portefeuilles et des
  retraits, et l'échange de carte SIM vise précisément ces comptes-là.
- **Invalidation ciblée des sessions** (`sessionsValidAfter`) : une suspension ou
  un changement de rôle coupe les sessions ouvertes.
- **Cloisonnement des rôles** appliqué **dans les services**, pas seulement dans
  les routes ni le middleware : un acte atteint par un autre chemin ne passe pas.
- **Accès aux fichiers par URL présignée** à durée limitée ; aucun proxy, aucun
  fichier servi directement.
- **Journalisation applicative de chaque consultation** de pièce d'identité et de
  document d'entreprise.
- **Limitation de débit** sur les points sensibles (connexion, code de
  vérification, signalement).
- **Audit écrit dans la transaction métier**, jamais en « fire and forget » : une
  décision et sa trace vivent ou échouent ensemble.

---

## 8. Ce qu'il reste à faire

- [ ] Compléter l'identité du responsable de traitement et le point de contact (§1).
- [ ] **Confirmer la localisation de chaque sous-traitant** et réunir les contrats (§4).
- [ ] Déposer la demande d'autorisation de transfert auprès de l'APDP.
- [x] ~~Fixer une durée de conservation du **journal d'audit** et écrire le job de purge.~~ Fait le 13 août 2026 — reste à arbitrer la durée des lignes protégées, qui suit la durée comptable.
- [ ] Fixer les durées légales de conservation comptable avec le conseil.
- [ ] Écrire la **procédure de notification de violation** — destinataire nommé, délai, canal.
- [ ] Vérifier l'information préalable des participants sur l'enregistrement des séances (T8).
- [ ] Mettre la politique de confidentialité en cohérence avec ce registre : transferts, durées, droits, réclamation auprès de l'APDP.
- [ ] Faire relire l'ensemble par un conseil camerounais.

---

*Ce registre doit être mis à jour à chaque changement de finalité, de destinataire
ou de durée. Le réflexe le plus simple : toute migration Prisma qui ajoute un
champ portant une donnée personnelle passe aussi par ce fichier.*
