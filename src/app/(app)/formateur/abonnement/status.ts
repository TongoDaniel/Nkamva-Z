// Libellés des états d'abonnement, tels que le formateur les voit.
//
// Formulés de son point de vue : ce qui l'intéresse n'est pas le nom du statut
// en base, c'est ce qu'il peut encore faire et ce qui va lui arriver.

export const SUBSCRIPTION_STATUS: Record<
  string,
  { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted"; help: string }
> = {
  ACTIVE: {
    label: "À jour",
    tone: "ok",
    help: "Vos ressources sont en vente et votre espace est pleinement ouvert.",
  },
  PAST_DUE: {
    label: "À régler",
    tone: "warn",
    help: "Une échéance attend son règlement. Vos ressources restent en vente pour l'instant.",
  },
  SUSPENDED: {
    label: "Suspendu",
    tone: "bad",
    help: "Vos ressources sont retirées du catalogue. Celles et ceux qui les ont achetées y accèdent toujours.",
  },
  CANCELED: {
    label: "Terminé",
    tone: "muted",
    help: "Votre espace reste ouvert pour retirer votre solde et suivre vos litiges.",
  },
};
