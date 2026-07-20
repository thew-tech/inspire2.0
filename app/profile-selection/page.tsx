"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"

const INSPECTOR_TYPES = [
  { id: "hud-certified-nspire", label: "I'm a HUD certified NSPIRE inspector", icon: "🏛️" },
  { id: "nspire-certified",     label: "I'm a Nspire certified inspector",      icon: "✅" },
  { id: "home-inspector",       label: "I'm a Home Inspector",                  icon: "🏠" },
  { id: "multi-unit-inspector", label: "I'm a Multi Unit Inspector",            icon: "🏢" },
]

export default function ProfileSelection() {
  const router = useRouter()
  const [typeOpen, setTypeOpen] = useState(false)

  return (
    <div className="portal-bg min-h-screen flex flex-col items-center justify-center px-4 py-10 overflow-x-hidden relative">

      {/* Decorative orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Logo */}
      <div className="relative z-10 mb-6 cursor-pointer" onClick={() => router.push("/")}>
        <Image src="/logo.png" alt="INSPIRE Logo" width={160} height={60} className="h-14 w-auto drop-shadow-lg" />
      </div>

      {/* Heading */}
      <div className="relative z-10 text-center mb-10">
        <h1 className="portal-heading text-4xl sm:text-5xl font-extrabold mb-3 tracking-tight">
          Welcome to <span className="portal-accent">INSPIRE</span>
        </h1>
        <p className="portal-sub text-base sm:text-lg">Select your portal to continue</p>
      </div>

      {/* Cards */}
      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 sm:grid-cols-3 gap-6">

        {/* ── Inspector Login ── */}
        <button
          onClick={() => router.push("/login?role=inspector")}
          className="portal-card group text-left"
        >
          <div className="portal-card-icon bg-gradient-to-br from-cyan-400 to-blue-600">
            <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
              <rect x="10" y="6" width="28" height="36" rx="3" stroke="white" strokeWidth="2.5" fill="none"/>
              <line x1="16" y1="14" x2="32" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="16" y1="20" x2="32" y2="20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="16" y1="26" x2="24" y2="26" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="20" cy="33" r="2" fill="white"/>
              <line x1="25" y1="33" x2="32" y2="33" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="portal-card-title">Inspector Login</h2>
          <p className="portal-card-desc">Field inspectors conducting property compliance inspections.</p>
          <div className="portal-card-cta group-hover:gap-3">
            <span>Continue</span>
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </div>
          <div className="portal-card-bar bg-gradient-to-r from-cyan-400 to-blue-600" />
        </button>

        {/* ── Management Login ── */}
        <button
          onClick={() => router.push("/management/login")}
          className="portal-card group text-left"
        >
          <div className="portal-card-icon bg-gradient-to-br from-violet-500 to-purple-700">
            <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
              <rect x="8" y="8"  width="14" height="14" rx="2" stroke="white" strokeWidth="2.5" fill="none"/>
              <rect x="26" y="8"  width="14" height="14" rx="2" stroke="white" strokeWidth="2.5" fill="none"/>
              <rect x="8" y="26" width="14" height="14" rx="2" stroke="white" strokeWidth="2.5" fill="none"/>
              <rect x="26" y="26" width="14" height="14" rx="2" stroke="white" strokeWidth="2.5" fill="none"/>
            </svg>
          </div>
          <h2 className="portal-card-title">Management Login</h2>
          <p className="portal-card-desc">Property managers and supervisors overseeing inspections.</p>
          <div className="portal-card-cta group-hover:gap-3">
            <span>Continue</span>
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </div>
          <div className="portal-card-bar bg-gradient-to-r from-violet-500 to-purple-700" />
        </button>

        {/* ── Inspector Types ── */}
        <div className="relative">
          <button
            onClick={() => setTypeOpen(o => !o)}
            className={`portal-card group text-left w-full ${typeOpen ? "portal-card-active" : ""}`}
          >
            <div className="portal-card-icon bg-gradient-to-br from-rose-400 to-orange-500">
              <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
                <circle cx="24" cy="16" r="7" stroke="white" strokeWidth="2.5" fill="none"/>
                <path d="M8 40c0-8.837 7.163-16 16-16s16 7.163 16 16" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <line x1="32" y1="30" x2="40" y2="30" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="36" y1="26" x2="36" y2="34" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h2 className="portal-card-title">Inspector Types</h2>
            <p className="portal-card-desc">Select your inspector certification to get the right portal.</p>
            <div className="portal-card-cta group-hover:gap-3">
              <span>{typeOpen ? "Close" : "Select Type"}</span>
              <svg className={`w-4 h-4 transition-transform duration-300 ${typeOpen ? "rotate-90" : "group-hover:translate-x-1"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </div>
            <div className="portal-card-bar bg-gradient-to-r from-rose-400 to-orange-500" />
          </button>

          {/* Dropdown */}
          <div className={`portal-dropdown ${typeOpen ? "portal-dropdown-open" : ""}`}>
            {INSPECTOR_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => router.push(`/login?role=inspector&type=${t.id}`)}
                className="portal-type-item group"
              >
                <span className="text-xl">{t.icon}</span>
                <span className="flex-1 text-left text-sm font-medium">{t.label}</span>
                <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Footer note */}
      <p className="relative z-10 mt-10 text-sm portal-footer-note">
        New here?{" "}
        <button onClick={() => router.push("/signup")} className="portal-footer-link">Create an account</button>
      </p>

      <style jsx>{`
        /* ── Background ── */
        .portal-bg {
          background: linear-gradient(135deg, #0a1628 0%, #0d2547 40%, #0a3352 70%, #06222e 100%);
        }

        /* ── Orbs ── */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          opacity: 0.35;
        }
        .orb-1 { width: 420px; height: 420px; background: radial-gradient(circle, #006795, transparent); top: -80px; left: -100px; }
        .orb-2 { width: 340px; height: 340px; background: radial-gradient(circle, #7c3aed, transparent); bottom: -60px; right: -80px; }
        .orb-3 { width: 260px; height: 260px; background: radial-gradient(circle, #f97316, transparent); top: 50%; left: 50%; transform: translate(-50%,-50%); opacity: 0.15; }

        /* ── Headings ── */
        .portal-heading { color: #f0f8ff; text-shadow: 0 2px 30px rgba(0,103,149,0.4); }
        .portal-accent  { background: linear-gradient(90deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .portal-sub     { color: #94a3b8; letter-spacing: 0.02em; }

        /* ── Card ── */
        .portal-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 2rem 1.75rem 1.75rem;
          border-radius: 1.5rem;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease, border-color 0.25s ease;
          box-shadow: 0 4px 30px rgba(0,0,0,0.3);
        }
        .portal-card:hover, .portal-card-active {
          transform: translateY(-6px);
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.18);
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }

        /* ── Card icon ── */
        .portal-card-icon {
          width: 3.5rem;
          height: 3.5rem;
          border-radius: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          flex-shrink: 0;
        }

        /* ── Card text ── */
        .portal-card-title { font-size: 1.2rem; font-weight: 700; color: #f0f8ff; margin: 0; }
        .portal-card-desc  { font-size: 0.85rem; color: #94a3b8; line-height: 1.6; flex: 1; }

        /* ── CTA ── */
        .portal-card-cta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: #38bdf8;
          transition: gap 0.2s ease;
          margin-top: 0.25rem;
        }

        /* ── Bottom accent bar ── */
        .portal-card-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          opacity: 0;
          transition: opacity 0.25s ease;
        }
        .portal-card:hover .portal-card-bar,
        .portal-card-active .portal-card-bar { opacity: 1; }

        /* ── Inspector type dropdown ── */
        .portal-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: rgba(13, 25, 48, 0.97);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 1rem;
          overflow: hidden;
          z-index: 50;
          transform-origin: top;
          transform: scaleY(0);
          opacity: 0;
          max-height: 0;
          transition: transform 0.25s ease, opacity 0.25s ease, max-height 0.3s ease;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
        }
        .portal-dropdown-open {
          transform: scaleY(1);
          opacity: 1;
          max-height: 400px;
        }

        .portal-type-item {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          padding: 0.875rem 1.25rem;
          width: 100%;
          border: none;
          background: transparent;
          color: #cbd5e1;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, padding-left 0.15s ease;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .portal-type-item:last-child { border-bottom: none; }
        .portal-type-item:hover {
          background: rgba(56,189,248,0.1);
          color: #f0f8ff;
          padding-left: 1.5rem;
        }

        /* ── Footer ── */
        .portal-footer-note { color: #64748b; }
        .portal-footer-link { color: #38bdf8; font-weight: 600; background: none; border: none; cursor: pointer; text-decoration: underline; }
        .portal-footer-link:hover { color: #7dd3fc; }
      `}</style>
    </div>
  )
}
