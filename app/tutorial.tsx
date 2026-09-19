"use client";

import { ArrowLeft, ArrowRight, Check, Globe2, Headphones, ListMusic, MessageSquare, Search, ThumbsUp, Users, X } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type TutorialRole = "host" | "guest";
type TutorialPhase = "setup" | "session";

type TutorialStep = {
  title: string;
  description: string;
  detail: string;
  icon: typeof Headphones;
  target: string;
  targetLabel: string;
  isWelcome?: boolean;
};

const HOST_SETUP_STEPS: TutorialStep[] = [
  {
    title: "Name your room",
    description: "Give your Hive a clear name.",
    detail: "Use your event, venue, or occasion so guests know they are in the right room.",
    icon: Headphones,
    target: "host-room-name",
    targetLabel: "Room name",
  },
  {
    title: "Choose your visibility",
    description: "Host without showing your identity.",
    detail: "Guests can still request and vote, but see an anonymous Hive Host.",
    icon: Users,
    target: "host-anonymous-toggle",
    targetLabel: "Anonymous Hive Host",
  },
  {
    title: "Start your session",
    description: "Start the party when you are ready.",
    detail: "Manage the Hive Queue and track votes while songs advance automatically. When the party is over, choose End Session from the dashboard and confirm the urgent prompt.",
    icon: ListMusic,
    target: "host-start-party",
    targetLabel: "Start Party",
  },
];

const HOST_SESSION_STEPS: TutorialStep[] = [
  {
    title: "Invite the crowd",
    description: "Open your QR code and let guests scan it.",
    detail: "Each scan takes a guest straight into this live Hive after they identify themselves.",
    icon: Users,
    target: "host-share-qr",
    targetLabel: "Let Crowd Scan",
  },
  {
    title: "Watch the Hive Queue",
    description: "Review requests and see what the crowd is supporting.",
    detail: "Open the queue to manage song order and keep the session moving.",
    icon: ListMusic,
    target: "host-manage-queue",
    targetLabel: "Hive Queue requests",
  },
  {
    title: "See the guest experience",
    description: "Switch to Hive View to see what guests can do.",
    detail: "Hosts can request, vote, and share feedback too, so you can understand the crowd's experience.",
    icon: Globe2,
    target: "host-switch-to-hive",
    targetLabel: "Switch to Hive View",
  },
  {
    title: "End the session safely",
    description: "Use End Session only when the party is over.",
    detail: "The confirmation prompt makes sure you do not stop the Hive accidentally.",
    icon: X,
    target: "host-end-session-trigger",
    targetLabel: "End session",
  },
];

const GUEST_STEPS: TutorialStep[] = [
  {
    title: "Welcome to Beat Hive",
    description: "You are in the room. Discover the music, people, and moments shaping this session.",
    detail: "",
    icon: Users,
    target: "",
    targetLabel: "",
    isWelcome: true,
  },
  {
    title: "Explore the controls",
    description: "Help shape the music, you are now a part of the Hive.",
    detail: "Switch to List to access requests, votes, and feedback.",
    icon: Users,
    target: "guest-view-toggle",
    targetLabel: "List view",
  },
  {
    title: "Meet the Hive",
    description: "See everyone who joined this party.",
    detail: "Open Hive to view the guests currently in the same session.",
    icon: Users,
    target: "guest-hive-action",
    targetLabel: "Hive action",
  },
  {
    title: "Request a track",
    description: "Search YouTube and add a song to Your queue.",
    detail: "Your requests stay separate from the shared Hive Queue.",
    icon: Search,
    target: "guest-request-action",
    targetLabel: "Request action",
  },
  {
    title: "Vote in the Hive Queue",
    description: "Thumbs up a Hive Queue track to support it.",
    detail: "Only the Hive Host sees vote totals; voting does not change song order.",
    icon: ThumbsUp,
    target: "guest-upvote-action",
    targetLabel: "Upvote action",
  },
  {
    title: "Share the vibe",
    description: "Send Energy, Vibes, or a Shoutout to the Hive Host.",
    detail: "The Hive Queue keeps playing automatically.",
    icon: MessageSquare,
    target: "guest-feedback-action",
    targetLabel: "Energy action",
  },
];

export function Tutorial({ role, phase = "setup" }: { role: TutorialRole; phase?: TutorialPhase }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetBounds, setTargetBounds] = useState<DOMRect | null>(null);
  const scrolledTargetRef = useRef<string | null>(null);
  const steps = role === "host" ? (phase === "setup" ? HOST_SETUP_STEPS : HOST_SESSION_STEPS) : GUEST_STEPS;
  const storageKey = `bh_tutorial_completed_${role}_${phase}`;
  const step = steps[currentStep];
  const isWelcome = step.isWelcome === true;
  const isHivePreview = step.target === "guest-hive-action";
  const isHostSessionTarget = role === "host" && phase === "session";
  const StepIcon = step.icon;

  useEffect(() => {
    setCurrentStep(0);
    setIsOpen(window.localStorage.getItem(storageKey) !== "true");
  }, [storageKey]);

  useEffect(() => {
    const replayTutorial = (event: Event) => {
      const detail = (event as CustomEvent<{ role?: TutorialRole; phase?: TutorialPhase }>).detail;
      if (detail?.role !== role || (detail.phase || "setup") !== phase) return;
      setCurrentStep(0);
      scrolledTargetRef.current = null;
      setIsOpen(true);
    };
    window.addEventListener("bh-replay-tutorial", replayTutorial);
    return () => window.removeEventListener("bh-replay-tutorial", replayTutorial);
  }, [phase, role]);

  useEffect(() => {
    if (!isOpen) return;
    window.dispatchEvent(new Event("bh-tutorial-open"));
    return () => {
      window.dispatchEvent(new Event("bh-tutorial-close"));
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !isWelcome && role === "guest") window.dispatchEvent(new Event("bh-tutorial-guest-open"));
  }, [isOpen, isWelcome, role, step.target]);

  useEffect(() => {
    if (!isOpen || isWelcome) return;
    const originalPaddingBottom = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${window.innerHeight}px`;
    return () => {
      document.body.style.paddingBottom = originalPaddingBottom;
    };
  }, [isOpen, isWelcome]);

  useEffect(() => {
    if (!isOpen) return;

    let animationFrame: number | null = null;
    const updateTargetBounds = () => {
      const target = document.querySelector<HTMLElement>(`[data-tutorial-target="${step.target}"]`);
      if (!target) {
        setTargetBounds(null);
        return;
      }
      if (scrolledTargetRef.current !== step.target) {
        target.scrollIntoView({ block: "start" });
        window.scrollBy({ top: -96 });
        scrolledTargetRef.current = step.target;
        window.requestAnimationFrame(() => setTargetBounds(target.getBoundingClientRect()));
      }
      setTargetBounds(target.getBoundingClientRect());
    };
    const targetObserver = new MutationObserver(updateTargetBounds);
    targetObserver.observe(document.body, { childList: true, subtree: true });
    updateTargetBounds();
    animationFrame = window.requestAnimationFrame(updateTargetBounds);
    window.addEventListener("resize", updateTargetBounds);
    window.addEventListener("scroll", updateTargetBounds, true);
    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      targetObserver.disconnect();
      window.removeEventListener("resize", updateTargetBounds);
      window.removeEventListener("scroll", updateTargetBounds, true);
    };
  }, [isOpen, step.target]);

  function finishTutorial() {
    window.localStorage.setItem(storageKey, "true");
    setIsOpen(false);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      {targetBounds && <motion.div
        className={`pointer-events-none fixed z-0 rounded-2xl border-2 ${isHostSessionTarget ? "border-cyan-200" : "border-yellow-400"}`}
        style={{ top: targetBounds.top, left: targetBounds.left, width: targetBounds.width, height: targetBounds.height, boxShadow: isHostSessionTarget ? "0 0 0 3px rgba(255,255,255,0.95), 0 0 0 7px rgba(34,211,238,0.8), 0 0 28px 10px rgba(34,211,238,0.45), 0 0 0 9999px rgba(0,0,0,0.76)" : "0 0 0 9999px rgba(0,0,0,0.76)" }}
        animate={isHostSessionTarget ? { scale: [1, 1.025, 1] } : { scale: 1 }}
        transition={isHostSessionTarget ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      />}
      {!targetBounds && <div className="pointer-events-none fixed inset-0 z-0 bg-black/75" />}
      <section className="fixed left-1/2 top-1/2 z-10 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-white/10 bg-[#111214] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2" aria-label={`Step ${currentStep + 1} of ${steps.length}`}>
              {steps.map((guideStep, index) => (
                <span key={guideStep.target} className={`h-1.5 rounded-full transition-all ${index === currentStep ? "w-7 bg-yellow-400" : index < currentStep ? "w-1.5 bg-yellow-500/70" : "w-1.5 bg-white/15"}`} />
              ))}
            </div>
            <button type="button" onClick={finishTutorial} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-white/10 hover:text-white" aria-label="Close tutorial" title="Close tutorial">
              <X size={18} />
            </button>
          </div>
          <div className="mt-6 flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-yellow-400 text-black shadow-lg shadow-yellow-400/10">
              <StepIcon size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-yellow-400">{isWelcome ? "Welcome" : `${role === "host" ? "Hive Host guide" : "Guest guide"} · ${currentStep + 1}/${steps.length}`}</p>
              <h2 id="tutorial-title" className="mt-1 text-xl font-bold text-white">{step.title}</h2>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-gray-300">{step.description}</p>
          {isHivePreview && (
            <div className="relative mt-4 h-28 overflow-hidden rounded-lg border border-white/10 bg-[radial-gradient(circle_at_50%_45%,rgba(245,158,11,0.16),transparent_45%),#181818]" aria-label="Sample Hive participant view">
              <div className="absolute left-3 top-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-yellow-400"><Globe2 size={13} /> Globe view</div>
              <motion.div className="absolute left-[12%] top-[42%] flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 py-1.5 pl-1.5 pr-2.5 text-xs font-bold text-white shadow-lg backdrop-blur-xl" animate={{ x: [0, 8, -3, 0], y: [0, -5, 4, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-500 text-[10px] text-black">M</span>Maya</motion.div>
              <motion.div className="absolute right-[10%] top-[36%] flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 py-1.5 pl-1.5 pr-2.5 text-xs font-bold text-white shadow-lg backdrop-blur-xl" animate={{ x: [0, -7, 4, 0], y: [0, 5, -4, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-400 text-[10px] text-black">T</span>Theo</motion.div>
              <motion.div className="absolute bottom-[10%] left-[37%] flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/15 py-1.5 pl-1.5 pr-2.5 text-xs font-bold text-white shadow-lg backdrop-blur-xl" animate={{ x: [0, 5, -5, 0], y: [0, -5, 3, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-500 text-[10px] text-black">Y</span>You</motion.div>
            </div>
          )}
          <div className="mt-6 flex items-center justify-between gap-3">
            {currentStep > 0 ? (
              <button type="button" onClick={() => setCurrentStep((index) => index - 1)} className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white" aria-label="Previous tutorial step" title="Previous">
                <ArrowLeft size={18} />
              </button>
            ) : <span />}
            {isWelcome ? (
              <button type="button" onClick={() => setCurrentStep(1)} className="flex h-10 items-center gap-2 rounded-md bg-yellow-400 px-4 text-sm font-bold text-black hover:bg-yellow-300">
                Start tour
                <ArrowRight size={18} />
              </button>
            ) : currentStep === steps.length - 1 ? (
              <button type="button" onClick={finishTutorial} className="flex h-10 items-center gap-2 rounded-md bg-yellow-400 px-4 text-sm font-bold text-black hover:bg-yellow-300">
                <Check size={18} /> Got it
              </button>
            ) : (
              <button type="button" onClick={() => setCurrentStep((index) => index + 1)} className="flex h-10 items-center gap-2 rounded-md bg-yellow-400 px-4 text-sm font-bold text-black hover:bg-yellow-300" aria-label="Next tutorial step" title="Next">
                Next
                <ArrowRight size={18} />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
