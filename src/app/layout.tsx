import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { BottomNav, TopNavDesktop } from "@/components/BottomNav"
import { NavVisibilityProvider } from "@/components/NavVisibilityProvider"
import { SiteFooter } from "@/components/shell/SiteFooter"
import { siteMetadataBase } from "@/lib/site-url"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
})

// The most-read string in the product: a search result and every shared link
// render it. It says what the app is for, which is a description's job — so
// `volunteer` stays even though the verb isn't built yet, and sharing an idea
// stays even though its composer is b2+. Both are deliberate; do not "fix" the
// copy to match the current build state.
//
// No promise, no absolute, no claim about fees or where dollars go — the
// previous description made one, and it is the class of statement removed from
// page copy on 2026-09-07. Kept under 155 characters so it renders whole
// rather than truncating mid-clause. Wording is the PM's; changing it is a PM
// question, not a copy edit.
const SITE_NAME = "SocialUs"
const SITE_DESCRIPTION =
  "Find and support the people near you. Meet your neighbors, trade what you make, " +
  "volunteer where it's needed, and share an idea before you build it."

export const metadata: Metadata = {
  metadataBase: siteMetadataBase(),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  // The root defined no openGraph until T148, so a shared link to the home
  // page fell back to the bare title. No image: that waits on the photo work.
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    type: "website",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="h-full font-sans">
        <NavVisibilityProvider>
          <div className="flex min-h-full flex-col">
            <TopNavDesktop />
            {/* #296 — content stops growing at 1680 and centres above it. */}
            <div className="mx-auto w-full max-w-shell flex-1">{children}</div>
            <SiteFooter />
          </div>
          <BottomNav />
        </NavVisibilityProvider>
      </body>
    </html>
  )
}
