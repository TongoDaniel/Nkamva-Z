import type { Metadata } from "next";
import { TrainersScreen } from "@/components/screens/trainers-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nos formateurs",
  description:
    "Les formateurs africains qui publient sur NKAMVA : leur domaine, leur expérience et leurs ressources.",
  robots: { index: false },
};

/** Annuaire des formateurs côté connecté. Jumeau visiteur : `/formateurs`. */
export default function FormateursConnectePage() {
  return <TrainersScreen space="app" />;
}
