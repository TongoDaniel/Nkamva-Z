import type { Metadata } from "next";
import { TrainersScreen } from "@/components/screens/trainers-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nos formateurs",
  description:
    "Les formateurs africains qui publient sur NkamVa : leur domaine, leur expérience et leurs ressources.",
};

/** Annuaire des formateurs côté visiteur. Jumeau connecté : `/catalogue/formateurs`. */
export default function FormateursPage() {
  return <TrainersScreen space="public" />;
}
