// ==========================================================================
// Garde-fous des agents — hook PreToolUse de .claude/hooks/garde-fous.mjs
// ==========================================================================
// GitHub ne protège pas les branches de ce dépôt (privé, offre gratuite), et un
// push sur develop déploie le staging. Le hook est donc la seule barrière entre
// une session Claude Code et ces gestes. Chaque cas est envoyé comme Claude Code
// l'envoie : un JSON sur l'entrée standard.

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const hook = path.resolve(__dirname, '../.claude/hooks/garde-fous.mjs')
const cwd = path.resolve(__dirname, '..')

function refuses(command: string): boolean {
  const out = execFileSync('node', [hook], {
    input: JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } }),
    encoding: 'utf8',
  })
  return out.includes('"deny"')
}

describe('Garde-fous des agents', () => {
  it.each([
    'git push origin develop',
    'git push origin main',
    'git push origin HEAD:develop',
    'git push -f origin feature:refs/heads/main',
    'git push --all origin',
    'cd x && git -C . push origin develop',
    'git stash',
    'git stash pop',
    'gh pr merge 19 --squash',
    'gh api repos/a/b/pulls/19/merge -X PUT',
    'npx prisma migrate deploy',
    'DATABASE_URL="x" npx prisma migrate deploy',
    'bunx prisma db push',
    'npm run db:push',
    'bun run db:seed',
    'bun prisma/seed.ts',
    'npx prisma migrate reset --force',
    // Le heredoc est écarté, la commande qui le suit reste lue.
    'cat > m.txt <<EOF\nnpx prisma migrate deploy\nEOF\ngit push origin develop',
  ])('refuse : %s', (command) => {
    expect(refuses(command)).toBe(true)
  })

  it.each([
    'git push -u origin fix/une-branche',
    'git stash list',
    'git status && git log --oneline -3',
    'gh pr create --base develop',
    'npx prisma generate',
    'npx vitest run tests/memberships.test.ts',
    'echo develop main',
    // Un corps de heredoc est du texte, jamais exécuté.
    "cat > m.txt <<'EOF'\nle seed, et git stash hors list/show\nEOF\ngit commit -F m.txt",
  ])('laisse passer : %s', (command) => {
    expect(refuses(command)).toBe(false)
  })
})
