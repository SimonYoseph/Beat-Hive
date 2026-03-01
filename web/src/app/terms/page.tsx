"use client";

import React, { useEffect } from "react";
import Link from 'next/link';
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  // Force scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="min-h-[100dvh] bg-[#111] text-gray-300 font-sans p-6 pb-20">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center gap-4 mb-8 pt-4">
          <Link href="/">
            <button className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
          </Link>
          <h1 className="text-2xl font-black text-white">Terms of Service</h1>
        </header>

        <div className="space-y-8 text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-yellow-500">1. Acceptance of Terms</h2>
            <p>
              By accessing and using BeatHive, you accept and agree to be bound by the terms and provision of this agreement. 
              These terms apply to all visitors, DJs, guests, and others who access or use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-yellow-500">2. Usage Rights</h2>
            <p>
              BeatHive grants you a personal, non-transferable, non-exclusive license to use the software for interactive 
              music queue management. DJs are responsible for the legal rights to play the music broadcasted during their sessions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-yellow-500">3. DJ Responsibilities & Tipping</h2>
            <ul className="list-disc pl-5 space-y-2 text-gray-400">
              <li>DJs retain the right to accept or reject song requests at their discretion.</li>
              <li>All tips and financial transactions processed through the platform are final. BeatHive may take a nominal processing fee for facilitation.</li>
              <li>BeatHive is a tool for event management and does not guarantee the quality, safety, or legality of individual events.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-yellow-500">4. User Conduct</h2>
            <p>
              Users agree not to use the Service to spam requests, harass DJs or other attendees, or transmit any 
              inappropriate or harmful content through the platform&apos;s messaging systems.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-yellow-500">5. Changes to Service</h2>
            <p>
              We reserve the right to modify or discontinue, temporarily or permanently, the Service with or without notice. 
              We shall not be liable to you or any third party for any modification, suspension, or discontinuance of the Service.
            </p>
          </section>
          
          <div className="pt-8 border-t border-white/10 text-xs text-gray-500">
            <p>Last Updated: February 28, 2026</p>
          </div>
        </div>
      </div>
    </main>
  );
}