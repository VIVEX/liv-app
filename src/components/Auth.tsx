// src/components/Auth.tsx
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState<string>('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    setMessage('')
    const { error } = await supabase.auth.signInWithOtp({ email }) // Magic Link por e-mail
    if (error) {
      setStatus('error')
      setMessage(error.message)
    } else {
      setStatus('sent')
      setMessage('Enviamos um link de login para seu e-mail ✉️')
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '40px auto', padding: 16 }}>
      <h2 style={{ fontWeight: 600, marginBottom: 12 }}>Entrar</h2>
      <form onSubmit={handleLogin} style={{ display: 'grid', gap: 8 }}>
        <input
          type="email"
          required
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          style={{
            padding: 10,
            borderRadius: 8,
            border: 'none',
            background: '#111827',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          {status === 'sending' ? 'Enviando…' : 'Enviar magic link'}
        </button>
        {message && (
          <p style={{ fontSize: 14, color: status === 'error' ? '#b91c1c' : '#065f46' }}>
            {message}
          </p>
        )}
      </form>
    </div>
  )
}
