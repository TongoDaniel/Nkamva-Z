// Garde-fous des agents sur le dépôt NKAMVA — hook PreToolUse (Bash, PowerShell).
//
// Les règles `deny` de settings.json bloquent un motif ; ce hook bloque une
// intention. `git push origin HEAD:develop` échappe à `Bash(git push origin
// develop*)`, pas à lui. GitHub ne peut pas faire ce travail ici : la protection
// de branche demande GitHub Pro sur un dépôt privé.
//
// Ce qui est refusé, et pourquoi (docs « Système d'agents IA », règles 9 à 13) :
//   - pousser vers develop ou main : un push sur develop déploie le staging ;
//   - fusionner une PR : même effet ;
//   - prisma migrate deploy / db push / migrate reset : le CLI lit .env et vise
//     la base de dev, même avec un DATABASE_URL exporté ;
//   - le seed : il purge la base qu'il vise ;
//   - git stash (sauf list et show) : la pile est commune aux sessions et aux
//     worktrees, deux sessions y ont déjà échangé leurs modifications.
//
// Sortie : un refus au format PreToolUse, avec son motif. Toute autre commande
// passe sans un mot.

import { execFileSync } from 'node:child_process'

const PROTECTED = new Set(['develop', 'main'])

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { data += chunk })
    process.stdin.on('end', () => resolve(data))
  })
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Garde-fou NKAMVA : ${reason} Si c'est voulu, c'est à toi de le faire à la main.`,
    },
  }))
  process.exit(0)
}

/**
 * Retire le corps des heredocs (`<<'EOF' … EOF`) : c'est du texte passé à une
 * commande, jamais exécuté. Sans cela, un message de commit qui cite
 * « git stash » se faisait refuser comme s'il en lançait un.
 */
function stripHeredocs(command) {
  const lines = command.split(/\r?\n/)
  const kept = []
  let tag = null
  for (const line of lines) {
    if (tag !== null) {
      if (line.trim() === tag) tag = null
      continue
    }
    kept.push(line)
    const m = line.match(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/)
    if (m) tag = m[2]
  }
  return kept.join('\n')
}

/** Découpe une ligne de commande en commandes simples (;, &&, ||, |, retour à la ligne). */
function segments(command) {
  return stripHeredocs(command).split(/\r?\n|&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean)
}

/** Mots d'une commande simple, guillemets retirés. Suffisant pour reconnaître git, gh, prisma. */
function words(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((w) => w.replace(/^["']|["']$/g, ''))
}

/** Les arguments qui suivent `git` une fois ses options globales (-C, -c, --git-dir…) sautées. */
function gitArgs(w) {
  const i = w.findIndex((x) => /(^|[\\/])git(\.exe)?$/i.test(x))
  if (i === -1) return null
  const rest = w.slice(i + 1)
  let j = 0
  let cdir
  while (j < rest.length && rest[j].startsWith('-')) {
    // -C <chemin> et -c <clé=valeur> prennent un argument séparé.
    if (rest[j] === '-C') cdir = rest[j + 1]
    j += (rest[j] === '-C' || rest[j] === '-c') ? 2 : 1
  }
  return { sub: rest[j], args: rest.slice(j + 1), cdir }
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/** La branche distante qu'une refspec vise : `HEAD:develop`, `+main`, `refs/heads/develop`. */
function refspecTarget(spec) {
  const dst = spec.replace(/^\+/, '').split(':').pop()
  return dst.replace(/^refs\/heads\//, '')
}

function checkGitPush(args, cwd) {
  if (args.some((a) => a === '--all' || a === '--mirror')) {
    deny('`git push --all` ou `--mirror` pousserait aussi develop et main.')
  }
  const positional = args.filter((a) => !a.startsWith('-'))
  const refspecs = positional.slice(1) // le premier est le dépôt distant
  if (refspecs.length === 0) {
    // `git push` ou `git push origin` : c'est la branche courante qui part.
    const branch = currentBranch(cwd)
    if (branch && PROTECTED.has(branch)) {
      deny(`\`git push\` depuis ${branch} pousserait ${branch} (un push sur develop déploie le staging).`)
    }
    return
  }
  for (const spec of refspecs) {
    const target = refspecTarget(spec)
    if (target === 'HEAD') {
      const branch = currentBranch(cwd)
      if (branch && PROTECTED.has(branch)) deny(`\`git push … HEAD\` depuis ${branch} pousserait ${branch}.`)
    } else if (PROTECTED.has(target)) {
      deny(`pousser vers ${target} est interdit aux agents (un push sur develop déploie le staging).`)
    }
  }
}

function check(command, cwd) {
  for (const segment of segments(command)) {
    const w = words(segment)
    const flat = w.join(' ')

    const git = gitArgs(w)
    if (git?.sub === 'push') checkGitPush(git.args, git.cdir ?? cwd)
    if (git?.sub === 'stash' && !['list', 'show'].includes(git.args[0])) {
      deny('`git stash` est interdit : la pile est commune aux sessions et aux worktrees. Travaille dans une branche ou un worktree.')
    }

    if (/(^|\s)gh\s+pr\s+merge\b/.test(flat)) {
      deny('fusionner une PR est interdit aux agents : fusionner vers develop déploie le staging.')
    }
    if (/(^|\s)gh\s+api\b.*\/pulls\/\d+\/merge\b/.test(flat)) {
      deny('fusionner une PR par l\'API est interdit aux agents.')
    }

    if (/\bprisma\s+migrate\s+(deploy|reset)\b/.test(flat) || /\bprisma\s+db\s+push\b/.test(flat)) {
      deny('`prisma migrate deploy|reset` et `prisma db push` sont interdits : le CLI lit .env et vise la base de dev. Pour la base de test, joue le SQL par psql (voir la mémoire du projet).')
    }
    if (/\b(db:push|db:reset|db:seed)\b/.test(flat)) {
      deny('les scripts db:push, db:reset et db:seed sont interdits aux agents.')
    }
    if (/\bprisma\s+db\s+seed\b/.test(flat) || /(^|[\s\\/])prisma[\\/]seed\.ts\b/.test(flat)) {
      deny('le seed purge la base qu\'il vise ; il est interdit aux agents.')
    }
  }
}

const input = JSON.parse((await readStdin()) || '{}')
const command = input?.tool_input?.command
if (typeof command === 'string' && command.trim()) check(command, input.cwd || process.cwd())
