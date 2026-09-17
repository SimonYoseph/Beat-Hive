"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { ArrowLeft, Globe2, List, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type HiveMember = {
  name: string;
  initials: string;
  image?: string | null;
  position: { left: string; top: string };
  drift: { x: number[]; y: number[]; rotate: number[] };
  duration: number;
};

type FloatingPosition = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
};

const PARTY_MEMBER_NAMES = ["Maya", "Theo", "Zuri", "Jordan", "Sam", "Nia", "Avery", "Kai", "Leah", "Miles", "Amara", "Dante", "Sasha", "Micah", "Ivy", "Noah", "Renee", "Omar", "Talia", "Ezra", "Jade", "Caleb", "Priya", "Leo", "Anika", "Mason", "Skye", "Isaiah", "Mila", "Cameron", "Amina", "Jules", "Elijah", "Sienna", "Malik", "Remy"];

const PARTY_MEMBERS: HiveMember[] = PARTY_MEMBER_NAMES.map((name, index) => {
  const angle = index * 137.508 * (Math.PI / 180);
  const radius = 0.32 + Math.sqrt((index + 1) / PARTY_MEMBER_NAMES.length) * 0.65;
  return {
    name,
    initials: name.slice(0, 1),
    position: { left: `${50 + Math.cos(angle) * radius * 40}%`, top: `${53 + Math.sin(angle) * radius * 38}%` },
    drift: { x: [0, index % 2 ? -7 : 7, index % 3 ? 4 : -4, 0], y: [0, index % 2 ? 4 : -4, index % 3 ? -3 : 3, 0], rotate: [0, 2, -2, 0] },
    duration: 17 + (index % 8),
  };
});

function ProfileAvatar({ member, index, size }: { member: HiveMember; index: number; size: "sm" | "md" }) {
  const isYellow = index % 2 === 0;
  const sizeClass = size === "sm" ? "h-10 w-10 text-sm" : "h-12 w-12 text-sm";
  const fallbackClass = isYellow ? "bg-yellow-500 text-[#1a1a1a]" : "bg-[#242424] text-yellow-400";

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-black ${sizeClass} ${member.image ? "bg-[#242424]" : fallbackClass}`}>
      {member.image ? <img src={member.image} alt={`${member.name} profile`} className="h-full w-full object-cover" /> : member.initials}
    </div>
  );
}

export default function HivePage() {
  const { data: session } = useSession();
  const [view, setView] = useState<"globe" | "list">("globe");
  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const bubbleRefs = useRef<Array<HTMLElement | null>>([]);
  const globeCanvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const storedIcon = window.localStorage.getItem("bh_customIcon");
      setCustomIcon(storedIcon ? JSON.parse(storedIcon) as string | null : null);
    } catch {
      setCustomIcon(null);
    }
  }, []);

  useEffect(() => {
    if (!session?.user?.email) return;

    async function loadProfileImage() {
      try {
        const response = await fetch("/api/settings");
        if (!response.ok) return;
        const { settings } = (await response.json()) as { settings?: { customIcon?: string | null } };
        if (settings?.customIcon !== undefined) setCustomIcon(settings.customIcon);
      } catch {
        // The local profile image and session image remain available offline.
      }
    }

    void loadProfileImage();
  }, [session?.user?.email]);

  const yourName = session?.user?.name || "You";
  const members: HiveMember[] = [
    {
      name: yourName,
      initials: yourName.slice(0, 1).toUpperCase(),
      image: customIcon || session?.user?.image,
      position: { left: "50%", top: "4%" },
      drift: { x: [0, -14, 10, 0], y: [0, 14, -10, 0], rotate: [0, -2, 2, 0] },
      duration: 24,
    },
    ...PARTY_MEMBERS,
  ];

  useEffect(() => {
    if (view !== "globe") return;

    const positions = members.map((member, index) => ({
      x: Math.min(92, Math.max(8, Number.parseFloat(member.position.left))),
      y: Math.min(90, Math.max(8, Number.parseFloat(member.position.top))),
      velocityX: Math.sin(index * 2.17) * 0.055,
      velocityY: Math.cos(index * 1.73) * 0.055,
    }));
    let animationFrame = 0;
    let lastUpdate = performance.now();
    const canvasBounds = globeCanvasRef.current?.getBoundingClientRect();

    const updatePositions = (timestamp: number) => {
      const elapsed = Math.min(32, timestamp - lastUpdate);
      lastUpdate = timestamp;
      const scale = elapsed / 16.67;

      positions.forEach((position) => {
        position.x += position.velocityX * scale;
        position.y += position.velocityY * scale;
      });

      for (let firstIndex = 0; firstIndex < positions.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < positions.length; secondIndex += 1) {
          const first = positions[firstIndex];
          const second = positions[secondIndex];
          const distanceX = second.x - first.x;
          const distanceY = second.y - first.y;
          const distance = Math.hypot(distanceX, distanceY) || 0.01;
          const collisionDistance = 13;
          if (distance >= collisionDistance) continue;

          const normalX = distanceX / distance;
          const normalY = distanceY / distance;
          const separation = (collisionDistance - distance) * 0.5;
          first.x -= normalX * separation;
          first.y -= normalY * separation;
          second.x += normalX * separation;
          second.y += normalY * separation;

          const velocityAlongNormal = (second.velocityX - first.velocityX) * normalX + (second.velocityY - first.velocityY) * normalY;
          if (velocityAlongNormal < 0) {
            const impulse = velocityAlongNormal * 0.85;
            first.velocityX += impulse * normalX;
            first.velocityY += impulse * normalY;
            second.velocityX -= impulse * normalX;
            second.velocityY -= impulse * normalY;
          }
        }
      }

      positions.forEach((position) => {
        if (position.x <= 8 || position.x >= 92) position.velocityX *= -1;
        if (position.y <= 8 || position.y >= 90) position.velocityY *= -1;
        position.x = Math.min(92, Math.max(8, position.x));
        position.y = Math.min(90, Math.max(8, position.y));
      });

      positions.forEach((position, index) => {
        const bubble = bubbleRefs.current[index];
        if (!bubble) return;
        const x = (position.x / 100) * (canvasBounds?.width || 0);
        const y = (position.y / 100) * (canvasBounds?.height || 0);
        bubble.style.transform = `translate3d(${x}px, ${y}px, 0) translate3d(-50%, -50%, 0)`;
      });
      animationFrame = window.requestAnimationFrame(updatePositions);
    };

    animationFrame = window.requestAnimationFrame(updatePositions);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [view, members.length]);

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#111] px-4 py-5 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-4xl flex-col">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="Return to party controls" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-300 transition-colors hover:border-yellow-500/50 hover:text-yellow-500">
            <ArrowLeft size={20} />
          </Link>
          <Link href="/" aria-label="Return to Beat Hive" className="text-center">
            <div className="flex items-center justify-center gap-2 text-xl font-black"><span>Beat</span><span className="text-yellow-500">Hive</span></div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500/80">Friday Night Live</p>
          </Link>
          <div className="flex h-11 min-w-11 items-center justify-center rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 text-sm font-bold text-yellow-500">
            <Users size={17} className="mr-1.5" /> {members.length}
          </div>
        </header>

        <section className="mt-8 flex flex-1 flex-col">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black">The Hive</h1>
              <p className="mt-1 text-sm text-gray-400">In this session now</p>
            </div>
            <div className="flex rounded-lg border border-white/10 bg-white/5 p-1" aria-label="Hive view">
              <button onClick={() => setView("globe")} aria-label="Globe view" aria-pressed={view === "globe"} className={`flex h-9 w-10 items-center justify-center rounded-md transition-colors ${view === "globe" ? "bg-yellow-500 text-black" : "text-gray-400 hover:text-white"}`}><Globe2 size={18} /></button>
              <button onClick={() => setView("list")} aria-label="List view" aria-pressed={view === "list"} className={`flex h-9 w-10 items-center justify-center rounded-md transition-colors ${view === "list" ? "bg-yellow-500 text-black" : "text-gray-400 hover:text-white"}`}><List size={18} /></button>
            </div>
          </div>

          {view === "globe" ? (
            <div className="mt-6 flex-1 overflow-auto rounded-2xl border border-white/10 bg-[#111]">
              <div ref={globeCanvasRef} className="relative min-h-[700px] min-w-[720px] overflow-hidden bg-[#111]">
                <img src="/images/vessel2-background.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full origin-top scale-[1.18] object-cover object-center opacity-30 mix-blend-screen [filter:grayscale(1)_contrast(2.8)_invert(1)_sepia(.5)_saturate(5)_hue-rotate(8deg)_blur(.45px)]" />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(250,204,21,0.05),rgba(17,17,17,0.86)_82%)]" />
                {members.map((member, index) => (
                  <article key={member.name} ref={(element) => { bubbleRefs.current[index] = element; }} className="absolute will-change-transform" style={{ left: 0, top: 0 }}>
                    <div className="flex min-w-24 items-center gap-2 rounded-full border border-white/20 bg-white/10 py-2 pl-2 pr-3 shadow-lg backdrop-blur-xl">
                      <ProfileAvatar member={member} index={index} size="sm" />
                      <span className="max-w-20 truncate text-sm font-bold">{member.name}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-3 pb-6">
              {members.map((member, index) => (
                <motion.div key={member.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5">
                  <ProfileAvatar member={member} index={index} size="md" />
                  <span className="font-bold">{member.name}</span>
                  {index === 0 && <span className="ml-auto rounded-full bg-yellow-500/15 px-2.5 py-1 text-xs font-bold text-yellow-500">You</span>}
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}