'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { authRedirectUrl } from '@/lib/site-url'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = useCallback(async (email: string, password: string, next?: string) => {
    // Without emailRedirectTo, Supabase falls back to the dashboard Site URL
    // for the confirmation link — which is how these end up on localhost.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: authRedirectUrl(next) },
    })
    return { data, error }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }, [])

  const signInWithOtp = useCallback(async (email: string, next?: string) => {
    const redirectTo = authRedirectUrl(next)
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      // shouldCreateUser (default true) is what makes one link serve both
      // sign-up and sign-in — an unknown email gets an account.
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    })
    return { data, error }
  }, [])

  // #407 — a password is set or reset from You; the reset link signs you in there.
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl('/you/password') })
    return { error }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    return { error }
  }, [])

  const signInWithGoogle = useCallback(async (next?: string) => {
    const redirectTo = authRedirectUrl(next)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    return { data, error }
  }, [])

  // F030: returning-user detection for the email-first signup page.
  const checkEmailRegistered = useCallback(async (email: string) => {
    const { data, error } = await supabase.rpc('email_is_registered', {
      p_email: email,
    })
    if (error) throw error
    return data === true
  }, [])

  return {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    signInWithOtp,
    resetPassword,
    updatePassword,
    signInWithGoogle,
    checkEmailRegistered,
  }
}
