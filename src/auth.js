// Signing in. One thing is kept in the config folder: credentials.json, a
// Harvest Personal Access Token and the Harvest account it acts in. The token
// acts as the person who made it, so every entry logged is theirs.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

export const NAME = 'harvest-lite-mcp'
export const USER_AGENT = `${NAME} (https://github.com/nvms/${NAME})`
const RUN = `npx -y github:nvms/${NAME}`
const TOKENS_PAGE = 'https://id.getharvest.com/developers'

const configDir = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), NAME)
const credentialsFile = () => join(configDir(), 'credentials.json')

function readLine(prompt) {
  return new Promise((resolve) => {
    process.stderr.write(prompt)
    const rl = createInterface({ input: process.stdin })
    rl.once('line', (line) => { resolve(line.trim()); rl.close() })
    rl.once('close', () => resolve(''))
  })
}

// the Harvest accounts a token can act in
async function harvestAccounts(token) {
  const response = await fetch('https://id.getharvest.com/api/v2/accounts', {
    headers: { authorization: `Bearer ${token}`, 'user-agent': USER_AGENT },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Harvest refused the token: ${body.error_description || body.error || response.status}`)
  return { user: body.user, accounts: (body.accounts ?? []).filter((a) => a.product === 'harvest') }
}

export async function signIn() {
  console.error(`Make a Personal Access Token at ${TOKENS_PAGE} (Create new personal access token), then paste it here.`)
  const token = await readLine('Token: ')
  if (!token) throw new Error('no token given')
  const { user, accounts } = await harvestAccounts(token)
  if (!accounts.length) throw new Error('this token reaches no Harvest account')
  let account = accounts[0]
  if (accounts.length > 1) {
    accounts.forEach((a, i) => console.error(`${i + 1}. ${a.name}`))
    account = accounts[Number(await readLine('Which account? ')) - 1]
    if (!account) throw new Error('no such account')
  }
  await mkdir(configDir(), { recursive: true, mode: 0o700 })
  await writeFile(credentialsFile(), JSON.stringify({ token, account_id: account.id }, null, 2), { mode: 0o600 })
  console.error(`Signed in as ${user?.first_name ?? ''} ${user?.last_name ?? ''} (${user?.email}) in ${account.name}.`)
}

let credentials = null
export async function useCredentials() {
  try {
    credentials = JSON.parse(await readFile(credentialsFile(), 'utf8'))
  } catch {
    throw new Error(`not signed in; run ${RUN} auth`)
  }
}

export function authHeaders() {
  return {
    authorization: `Bearer ${credentials.token}`,
    'harvest-account-id': String(credentials.account_id),
    'user-agent': USER_AGENT,
  }
}

export const signInAgain = `sign in again with ${RUN} auth`
