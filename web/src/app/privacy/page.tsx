"use client";

import React, { useEffect } from "react";
import Link from 'next/link';
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
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
          <h1 className="text-2xl font-black text-white">Privacy Policy</h1>
        </header>

        <div className="space-y-8 text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-yellow-500">1. Information We Collect</h2>
            <p>
              We collect information to provide better services to all our users. This includes:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-gray-400">
              <li>Information you give us directly (e.g., account details, email address).</li>
              <li>Information we get from your use of BeatHive (e.g., connection logs, device information for pairing).</li>
              <li>Music preferences and song requests made during live DJ sessions.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-yellow-500">2. How We Use Information</h2>
            <p>
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-gray-400">
              <li>Provide, maintain, and improve our services.</li>
              <li>Process transactions and send related information, including confirmations and receipts.</li>
              <li>Send you technical notices, updates, security alerts, and support messages.</li>
              <li>Personalize and improve the music queue and interaction experiences.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-yellow-500">3. Information Sharing</h2>
            <p>
              We do not share your personal information with companies, organizations, or individuals outside of BeatHive 
              except in the following cases:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-gray-400">
              <li>With your consent (e.g., when you link Spotify or Apple Music).</li>
              <li>With DJs (e.g., displaying your username or anonymous proxy when you make a request or tip).</li>
              <li>For legal reasons if required by applicable law, regulation, legal process, or enforceable governmental request.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-yellow-500">4. Data Security</h2>
            <p>
              We work hard to protect BeatHive and our users from unauthorized access to or unauthorized alteration, disclosure, 
              or destruction of information we hold. We use industry-standard encryption to protect data in transit and at rest.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-yellow-500">5. Anonymous DJs and Guests</h2>
            <p>
              BeatHive offers an &apos;Incognito&apos; mode. While your public activity will be masked on the frontend, internal logs may 
              still connect your actions to your account for moderation, security, and payment processing purposes.
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