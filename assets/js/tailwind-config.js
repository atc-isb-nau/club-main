// Must load right after the Tailwind CDN script.
tailwind.config = {
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        card: 'var(--card)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        gold: 'var(--gold)',
        'gold-ink': 'var(--gold-ink)',
        green: 'var(--green)',
        'green-ink': 'var(--green-ink)',
        btn: 'var(--btn)'
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Public Sans', '-apple-system', 'Arial', 'sans-serif']
      }
    }
  }
};
