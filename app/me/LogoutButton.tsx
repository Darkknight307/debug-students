"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/client";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await api.auth.logout().catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="btn btn-ghost" onClick={logout} disabled={busy}>
      {busy ? "шығуда…" : "Шығу"}
    </button>
  );
}
