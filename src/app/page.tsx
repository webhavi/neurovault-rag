'use client'

import { useEffect, useState } from 'react'

/**
 * Launcher: hands the preview panel off to the NeuroVault lab, which the
 * FastAPI process serves under /preview/ (proxied to the Python backend).
 */
export default function Home() {
  const [seconds, setSeconds] = useState(3)

  useEffect(() => {
    const tick = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    const redirect = window.setTimeout(() => {
      window.location.replace('/preview/')
    }, 3000)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(redirect)
    }
  }, [])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        background: 'linear-gradient(160deg, #070A12 0%, #0B1020 55%, #10142c 100%)',
        color: '#EAF2FF',
        fontFamily: 'Inter, system-ui, sans-serif',
        textAlign: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(66,232,245,0.18), rgba(152,117,255,0.22))',
          border: '1px solid rgba(66,232,245,0.35)',
          boxShadow: '0 0 34px -8px rgba(66,232,245,0.5)',
          fontSize: 34,
        }}
      >
        🧠
      </div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
        NeuroVault — Deep Learning Intelligence Lab
      </h1>
      <p style={{ color: '#8A97B4', maxWidth: 460, lineHeight: 1.6, fontSize: '0.95rem' }}>
        Launching the RAG research workspace: 3D neural scene, knowledge library,
        retrieval pipeline explorer and embedding space.
      </p>
      <a
        href="/preview/"
        style={{
          marginTop: '0.5rem',
          padding: '0.8rem 1.6rem',
          borderRadius: 12,
          fontWeight: 600,
          fontSize: '0.95rem',
          color: '#04121c',
          background: 'linear-gradient(90deg, #42E8F5, #9875FF)',
          textDecoration: 'none',
          boxShadow: '0 0 28px -8px rgba(66,232,245,0.55)',
        }}
      >
        Enter the lab{seconds > 0 ? ` (${seconds})` : ''}
      </a>
      <p style={{ color: '#5b6b8c', fontSize: '0.78rem', marginTop: '1rem' }}>
        Backend: FastAPI on port 8000 · without GROQ_API_KEY chat answers are
        disabled and retrieval demos stay live.
      </p>
    </main>
  )
}
