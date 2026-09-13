"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function AuthPage() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-6 border rounded shadow-sm">
        <h1 className="text-xl font-semibold mb-4">Profile Settings</h1>

        {session ? (
          <>
            <div className="flex items-center gap-3">
              {session.user?.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.user.image} alt="avatar" className="w-12 h-12 rounded-full" />
              )}
              <div>
                <div className="font-medium">{session.user?.name}</div>
                <div className="text-sm text-gray-500">{session.user?.email}</div>
              </div>
            </div>

            <hr className="my-4" />

            <div className="mb-3">
              <button
                className="bg-red-600 text-white px-3 py-1 rounded"
                onClick={() => {
                  try { localStorage.removeItem('bh_isAuthenticated'); } catch {}
                  signOut({ callbackUrl: '/' });
                }}
              >
                Sign out
              </button>
            </div>

            <div className="text-sm text-gray-600">User ID: {session.user?.email ?? 'unknown'}</div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm">You are not signed in.</p>
            <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={() => signIn('google')}>
              Sign in with Google
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
