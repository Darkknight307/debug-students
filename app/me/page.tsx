import { Suspense } from "react";
import MeView from "./MeView";

export const metadata = { title: "DEBUG · Менің бетім" };

export default function MePage() {
  return (
    <Suspense>
      <MeView />
    </Suspense>
  );
}
