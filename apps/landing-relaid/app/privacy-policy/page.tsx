import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Relaid",
  description:
    "Privacy Policy for the Relaid mobile app and related services.",
};

export default function PrivacyPolicyPage() {
  const effectiveDate = "May 2, 2026";

  return (
    <div className="min-h-screen relative font-body selection:bg-ink selection:text-white">
      <div className="halftone-bg" />

      <header className="relative z-10 px-6 md:px-12 py-8 max-w-3xl mx-auto">
        <Link
          href="/"
          className="outfit uppercase tracking-widest text-xs text-[#1A1A2E]/70 hover:text-[#1A1A2E] transition-colors"
        >
          ← Back to Relaid
        </Link>
      </header>

      <main className="relative z-10 px-6 md:px-12 pb-20 max-w-3xl mx-auto">
        <h1 className="outfit text-4xl sm:text-5xl leading-[0.95] text-[#1A1A2E]">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm opacity-70">Effective date: {effectiveDate}</p>

        <section className="mt-10 space-y-4">
          <h2 className="outfit text-lg uppercase tracking-widest">
            1. Overview
          </h2>
          <p className="leading-relaxed opacity-90">
            This Privacy Policy explains how the Relaid mobile app (“App”) and the
            Relaid website (“Website”) handle information. Relaid is designed to
            let you control AI coding agents running on a computer you operate,
            via a relay/server you connect to.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="outfit text-lg uppercase tracking-widest">
            2. Information You Provide
          </h2>
          <ul className="list-disc pl-6 space-y-2 opacity-90 leading-relaxed">
            <li>
              Prompts, messages, and instructions you send through the App.
            </li>
            <li>
              Content returned by your agent/relay, which may include code,
              logs, diffs, file paths, and other project data.
            </li>
            <li>
              Pairing details you enter (for example, a server/relay URL or
              pairing credentials).
            </li>
          </ul>
          <p className="leading-relaxed opacity-90">
            Some of this information may be sensitive depending on what you put
            into your prompts or what exists in your repositories.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="outfit text-lg uppercase tracking-widest">
            3. Information Collected Automatically
          </h2>
          <p className="leading-relaxed opacity-90">
            The App may process basic technical data needed to function, such as
            device/OS version, app version, and network information. If you
            enable notifications, the App may obtain a push notification token
            and share it with the server you are connected to so notifications
            can be delivered.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="outfit text-lg uppercase tracking-widest">
            4. App Permissions
          </h2>
          <p className="leading-relaxed opacity-90">
            Relaid may request access to certain device features:
          </p>
          <ul className="list-disc pl-6 space-y-2 opacity-90 leading-relaxed">
            <li>
              <span className="font-semibold">Camera</span>: used to scan a QR
              code for pairing your phone with your relay/server. Camera frames
              are used on-device for QR detection.
            </li>
            <li>
              <span className="font-semibold">Photo library/media</span>: optional,
              used if you choose to upload an image containing a QR code to pair.
              The image is used on-device to read the QR code.
            </li>
            <li>
              <span className="font-semibold">Notifications</span>: optional,
              used to deliver session updates if you enable notifications.
            </li>
          </ul>
          <p className="leading-relaxed opacity-90">
            After a QR code is read, the pairing payload (for example, relay URL
            and a short-lived pairing secret) is transmitted to your configured
            relay/server to complete pairing.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="outfit text-lg uppercase tracking-widest">
            5. How We Use Information
          </h2>
          <ul className="list-disc pl-6 space-y-2 opacity-90 leading-relaxed">
            <li>Provide the App’s core functionality (sessions, messaging).</li>
            <li>
              Connect to your configured relay/server and display agent output.
            </li>
            <li>
              Support features like file views, diffs, and git metadata display.
            </li>
            <li>Deliver push notifications if enabled.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="outfit text-lg uppercase tracking-widest">
            6. Sharing
          </h2>
          <p className="leading-relaxed opacity-90">
            Relaid is primarily a client that communicates with the relay/server
            you configure. Information you send in the App is transmitted to that
            relay/server and any connected agent processes. You are responsible
            for who can access your relay/server and for the data you share with
            it.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="outfit text-lg uppercase tracking-widest">
            7. Data Storage &amp; Retention
          </h2>
          <p className="leading-relaxed opacity-90">
            The App may store certain data locally on your device (for example,
            pairing state and cached session data) to improve performance and
            provide offline-friendly behavior. Data retention on your relay/server
            depends on how you run and configure it.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="outfit text-lg uppercase tracking-widest">
            8. Security
          </h2>
          <p className="leading-relaxed opacity-90">
            Protecting your data depends on your device security and the security
            of the relay/server you connect to. Use strong authentication where
            available, keep your software updated, and avoid pairing on untrusted
            networks.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="outfit text-lg uppercase tracking-widest">
            9. Changes
          </h2>
          <p className="leading-relaxed opacity-90">
            We may update this Privacy Policy from time to time. When we do, we
            will update the effective date above.
          </p>
        </section>
      </main>
    </div>
  );
}
