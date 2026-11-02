import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { AppShell } from '@/components/app-shell.tsx'
import { useAuth } from '@/auth/auth-context.ts'

// Every staff view sits behind this gate (TODO 4.1). Dev pages stay public.
export function AuthGate() {
  const { state } = useAuth()
  switch (state.status) {
    case 'staff':
      return <AppShell />
    case 'loading':
      return (
        <Screen title="PROLOG Moneyball">
          <p role="status" className="text-muted-foreground">
            Checking your sign-in…
          </p>
        </Screen>
      )
    case 'signed-out':
      return <SignInPage />
    case 'no-access':
      return <NoAccessPage email={state.email} />
    case 'unconfigured':
      return (
        <Screen title="Not Configured">
          <p>
            This build has no Supabase settings. Set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> and build again.
          </p>
        </Screen>
      )
    case 'error':
      return (
        <Screen title="Something Went Wrong">
          <p>Your access could not be checked: {state.message}</p>
          <p className="text-muted-foreground">Reload the page to try again.</p>
        </Screen>
      )
  }
}

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      aria-label="PROLOG Moneyball"
      className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-sm"
    >
      <p className="text-xs font-semibold tracking-wide">
        PROLOG <span className="text-primary">Moneyball</span>
      </p>
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </main>
  )
}

function SignInPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPhase('sending')
    setError(null)
    const result = await signIn(email.trim())
    if (result.ok) {
      setPhase('sent')
    } else {
      setPhase('idle')
      setError(result.message)
    }
  }

  if (phase === 'sent') {
    return (
      <Screen title="Check Your Email">
        <p role="status">
          If {email.trim()} belongs to a staff account, a sign-in link is on its way. Open it in
          this browser.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setPhase('idle')
          }}
        >
          Use Another Email
        </Button>
      </Screen>
    )
  }

  return (
    <Screen title="Sign In">
      <p className="text-muted-foreground">
        Staff only. Enter your email and we will send you a sign-in link.
      </p>
      <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
            }}
            className="h-9 rounded-md border bg-transparent px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={phase === 'sending'}>
          {phase === 'sending' ? 'Sending…' : 'Send Sign-In Link'}
        </Button>
      </form>
    </Screen>
  )
}

function NoAccessPage({ email }: { email: string | null }) {
  const { signOut } = useAuth()
  return (
    <Screen title="No Access">
      <p>
        You are signed in{email ? ` as ${email}` : ''}, but this account is not on the staff list.
        Ask the coach to add you.
      </p>
      <Button variant="outline" onClick={() => void signOut()}>
        Sign Out
      </Button>
    </Screen>
  )
}
