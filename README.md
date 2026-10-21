# harvest-lite-mcp

An MCP server that reads your Harvest time and logs time for you. It acts only as you: it sees your own projects and entries, and changes only your own entries.

- `projects`: the projects and tasks you can log time to
- `entries`: your time entries over a stretch of days, with their total
- `log_time`: logs time
- `update_entry`: changes one of your entries
- `delete_entry`: deletes one of your entries

## Setup

### 1. Sign in

```sh
npx -y github:nvms/harvest-lite-mcp auth
```

It asks for a Personal Access Token. Make one at [id.getharvest.com/developers](https://id.getharvest.com/developers) (**Create new personal access token**) and paste it. If the token reaches more than one Harvest account, it asks which.

Signing in again (say, after revoking the token) is the same command.

### 2. Add it to a project

```json
{ "mcpServers": { "harvest": { "command": "npx", "args": ["-y", "github:nvms/harvest-lite-mcp"] } } }
```

## Where things are kept

`~/.config/harvest-lite-mcp/credentials.json` holds the token and the account. Delete it to sign out.

## When something goes wrong

- **"not signed in"**: see part 1.
- **"Harvest refused the token"**: the token was revoked or mistyped; sign in again.
