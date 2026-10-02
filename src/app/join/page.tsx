'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

// INTERIM TARGET — the seller entry point is `/you` until the You rebuild lands.
// `/register-vendor` is being retired with the vendor/market sweep. `/you` is the
// ratified producer/organizing surface, and its SellCta already handles all three
// routing branches (no shop → walkthrough, draft → resume, active shop → /you/sell).
// Anonymous visitors go through the magic-link flow first: /you renders an empty
// signed-out shell and SellCta hides without a memberId, so landing a stranger
// there directly would show them nothing. Revisit when /you is rebuilt.
const SELLER_ENTRY = '/you'
const SELLER_ENTRY_SIGNED_OUT = `/auth/login?next=${encodeURIComponent(SELLER_ENTRY)}`

export default function JoinPage() {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [authed, setAuthed] = useState<boolean | null>(null)

  // Share the pitch page itself, not the signup form — the recipient is not yet
  // a Member and needs the explanation before the form.
  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tracked in #119
    setUrl(`${origin}/join`)

    const client = supabase()
    client.auth.getUser().then(({ data }) => setAuthed(!!data.user))
  }, [])

  const primaryHref = authed ? SELLER_ENTRY : SELLER_ENTRY_SIGNED_OUT

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="min-h-screen bg-white pb-32 md:pb-24">
      {/* Hero */}
      <section className="px-6 pt-12 md:pt-20 pb-10 max-w-3xl mx-auto text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-accent)] font-semibold">For vendors</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-semibold text-neutral-900 leading-tight">
          Sell at a farmers market? Get listed.
        </h1>
        <p className="mt-4 text-lg text-neutral-700 max-w-xl mx-auto">
          SocialUs helps the customers you meet at the market find you the other six days of the week.
          Listing costs nothing.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={primaryHref}
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] px-6 py-3 text-base font-semibold text-white hover:bg-[var(--color-accent-hover)] shadow-sm"
          >
            {authed ? 'List my booth →' : 'Sign up as a vendor →'}
          </Link>
          {!authed && (
            <Link
              href={SELLER_ENTRY_SIGNED_OUT}
              className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-6 py-3 text-base font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              Already a member? Log in
            </Link>
          )}
        </div>
      </section>

      {/* Why */}
      <section className="px-6 py-10 bg-neutral-50">
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <Benefit
            title="Followable between markets"
            body="Customers who love what you made on Saturday can find you on Wednesday."
          />
          <Benefit
            title="Listing costs nothing"
            body="There is no charge to create a listing or keep it up."
          />
          <Benefit
            title="Local-first audience"
            body="People on SocialUs already want to spend locally. You're not marketing to strangers — you're being introduced."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-12 max-w-3xl mx-auto">
        <h2 className="text-2xl font-semibold text-neutral-900 text-center">How it works</h2>
        <ol className="mt-6 space-y-5">
          <Step n={1} title="Create an account" body="Email and password. Takes 10 seconds." />
          <Step
            n={2}
            title="Tell customers who you are"
            body="Your name, a tagline, what you make, and which markets you attend. About 90 seconds."
          />
          <Step
            n={3}
            title="Your profile goes live"
            body="You're immediately in the feed, the map, and searchable by product."
          />
          <Step
            n={4}
            title="Customers follow you"
            body="They get updates when you'll be at an upcoming market. No more 'I forgot your name.'"
          />
        </ol>

        <div className="mt-8 text-center">
          <Link
            href={primaryHref}
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] px-6 py-3 text-base font-semibold text-white hover:bg-[var(--color-accent-hover)]"
          >
            {authed ? 'List my booth →' : 'Start my listing →'}
          </Link>
        </div>
      </section>

      {/* Share */}
      <section className="px-6 py-12 bg-neutral-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-semibold text-neutral-900">Share with another vendor</h2>
          <p className="mt-2 text-neutral-700">
            Know someone at the market who should be on here? Send them this link.
          </p>

          <div className="mt-6 flex flex-col items-center gap-4">
            <a href={url || '#'} className="text-sm text-[var(--color-accent)] underline break-all max-w-full">
              {url || 'Loading…'}
            </a>

            <button
              type="button"
              onClick={copy}
              disabled={!url}
              className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

function Benefit({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-md border border-neutral-200 p-5">
      <h3 className="font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{body}</p>
    </div>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-accent)] text-white text-sm font-semibold flex items-center justify-center">
        {n}
      </div>
      <div>
        <p className="font-semibold text-neutral-900">{title}</p>
        <p className="text-sm text-neutral-600 mt-1">{body}</p>
      </div>
    </li>
  )
}
