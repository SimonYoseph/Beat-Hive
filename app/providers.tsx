"use client";

import { SessionProvider } from "next-auth/react";

import { PlaybackProvider } from "./playback-provider";
import { RoomProvider } from "./room-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <RoomProvider>
        <PlaybackProvider>{children}</PlaybackProvider>
      </RoomProvider>
    </SessionProvider>
  );
}
