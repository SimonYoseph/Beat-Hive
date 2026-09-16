"use client";

import { SessionProvider } from "next-auth/react";

import { PlaybackProvider } from "./playback-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PlaybackProvider>{children}</PlaybackProvider>
    </SessionProvider>
  );
}
