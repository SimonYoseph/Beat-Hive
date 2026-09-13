"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";

function AuthControls() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  if (!session) return null;

  return (
      <div className="p-2">
      <button
        className="bg-red-600 text-white px-3 py-1 rounded"
        onClick={() => {
          try { localStorage.removeItem('bh_isAuthenticated'); } catch {};
          signOut({ callbackUrl: '/' });
        }}
      >
        Sign out
      </button>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="fixed top-4 right-4 z-50">
        <AuthControls />
      </div>
      {children}
    </SessionProvider>
  );
}
