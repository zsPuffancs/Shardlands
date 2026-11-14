# Game Masters

Three staff accounts, **zsPuffancs**, **ColdSteel** and **MaxyKing**, each with its own password and its own GM
character. They sign in with **F10**, apart from player login, and get a control panel and a golden GM emblem that
every player sees.

## Security model

| Concern | How it is handled |
|---|---|
| Accounts | Exactly the three names in `GM_ACCOUNTS` (`src/player/gm-accounts.js`). No registration, no other source. |
| Passwords | Only salted scrypt hashes (N = 2^15, r = 8, p = 1, 16-byte salt per account) in `gm-accounts.json` at the repository root. Git-ignored, never bundled, never in source, config, saves or logs. |
| Separation | Player login (`join`) never reads the GM store and rejects the three GM names in any spelling. GM login (`gmLogin`) reads only the GM store, so player credentials never work there. |
| Session | Lives only on the server's connection object (`connection.gmAuth`). Nothing is sent to the client as a token or saved. It ends when the connection closes, on GM sign-out, or when the connection logs in as a player. |
| Permissions | Every `gm` command checks on the server that the connection is authenticated as the account that owns the character it plays. Client values cannot grant anything. Normal characters never get `player.gm`. |
| GM characters | Saved under `gm:<account>` keys in `saves.json`. Player names cannot contain `:`, so no player login can open, copy or overwrite them. |
| First login | Provisioned passwords are marked `mustChange`; the GM must choose a new one (12+ characters, not containing the account name) before entering. |
| Guessing | 5 failures within 15 minutes lock that account and that address. The lock starts at 30 s and doubles up to 15 minutes. Unknown names take as long to reject as wrong passwords. The connection's own message budget applies on top. Behind the invite tunnel the visitor's forwarded address is used. |
| Powers | Invincibility and god mode are enforced in the server's damage hook and a 200 ms server timer. They are kept only in memory and end when the GM leaves. |
| Audit | `gm-audit.log` (git-ignored, JSON lines): time, account, action, target, amount and address for logins, failures, password changes, enter, sign-out and every command, including refused attempts by normal characters. Never passwords. |

A GM character also has the existing admin chat commands (`/help` lists them).

## Provisioning (once, on the server computer)

```
node scripts/gm-provision.js            create the accounts that do not exist yet
node scripts/gm-provision.js --vault    ... and also save the new passwords in this computer's credential store
node scripts/gm-provision.js --status   which accounts exist (no secrets)
node scripts/gm-provision.js --reset ColdSteel --yes   replace one password (it must be changed again on login)
```

- Each new password is 24 random characters. It is shown **once**, in the terminal, and only to an interactive
  terminal: the script refuses to print passwords into a pipe or file.
- Existing accounts are never changed unless you pass `--reset <name> --yes`.
- Hand each password to its owner privately, then clear the terminal. Each owner signs in with F10 and chooses
  their own password.
- When the game server starts, it lists any account that has not been provisioned yet.

## Using it

1. Start Shardlands and press **F10** on the login screen.
2. Enter the GM name and password.
3. First time only: replace the initial password.
4. Choose **Enter as <name>**. A new GM character uses the class selected on the login screen.
5. In the game, **F10** opens or closes the control panel. **Esc** also closes it.

The panel has these tabs:

- **Character:** give or remove gold, give XP, set level, heal, restore health, mana and cooldowns. Each acts on you
  or on a chosen online player. Add Souls to your own GM character (the normal Soul balance, capped like any credit).
- **World:** travel to any unlocked map or biome, cycle to the next unlocked map, teleport to a founding zone or to
  coordinates, teleport to the World Boss (or to its lair, where it wakes, if it has not spawned yet).
  **Skip worlds** (1-50) advances the whole universe that many World Tiers, one at a time, through the same path a
  World Boss victory takes: each new region is generated and validated, one victory is recorded per tier (no kill
  rewards), the region is activated and every player is notified; then the GM travels to the newest map. It stops
  early, and says why, if a tier cannot be prepared. Tiers 2-7 are zones of the Founding Lands; from tier 8 each
  tier is its own map.
- **Combat:** kill enemies within 650 units, or every enemy on the current map only. The World Boss is spared in both,
  because killing it advances the universe. Also damage the selected enemy, and toggle invincibility and god mode.
- **Items:** spawn equipment (slot, rarity Common to Mythic, item level, count 1-500) from the normal generator, and
  consumables. Equipment goes into the bag until it is full; the reply says how many were delivered and how many
  could not be added. Nothing is dropped.
- **Saved GM Credentials** and **Account** (change password, sign out).

Commands that cannot be undone (remove gold, set level, the kills, map travel) ask for confirmation in the panel, and
the server refuses them without it. Kills go through the normal combat path, so rewards and respawns behave as for
any kill.

## Emblem

A crown over large golden "GM" lettering, with feathered wings, a soft glow and rising sparks. All three GMs share
it; the crown's gem differs per account (ruby, sapphire, emerald). It is drawn in `public/gm.js` and kept separate from
the character model. Every frame it is projected to the character's head through the same world-to-screen path as
name labels, so it follows walking, running and attacks. GM players carry `gm: <1-3>` in their player snapshot row,
so every client draws it. GM name labels are gold.

## Saved GM Credentials (local vault)

`desktop/credential-vault.js` stores the three passwords in the operating system's credential store on the
administrator's own computer:

- **Windows:** Credential Manager, as generic credentials `Shardlands GM/<account>`, persisted on this computer only
  and not roaming.
- **macOS:** the login Keychain.
- **Linux:** the Secret Service (`secret-tool`).

Secrets pass only through the helper's stdin and stdout, never through command-line arguments. If no secure store is
available, the vault says why and stores nothing; there is no plaintext fallback. Credentials are never synchronised
and never leave the computer.

### Current state and remaining desktop integration

Shardlands has **no desktop shell yet**: it runs in a browser served by `local-server.js`. A browser page cannot
reach the operating system's credential store, so in the browser the **Saved GM Credentials** tab explains this and
offers no storage. What works today:

- `node scripts/gm-provision.js --vault` saves new passwords straight into the computer's credential store.
- The Electron pieces are written and tested with a stand-in for Electron: `desktop/vault-ipc.js` (main process: five
  fixed channels, argument validation, caller check) and `desktop/preload.js`. The preload exposes
  `window.shardlandsVault` with `status`, `list`, `save`, `reveal` and `remove`, and no Node APIs. `public/gm.js`
  uses it automatically when present: save, update, reveal and hide, copy name or password, and delete with
  confirmation. Revealing or copying needs your GM password again, checked by the server, and unlocks for 2 minutes.

To finish the desktop app:

1. Add an Electron shell (main process) that starts `server.js` or connects to a server, and opens the game in a
   `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` and
   `preload: desktop/preload.js`.
2. In the main process, call `registerVaultIpc(ipcMain, { isTrustedSender })`. `isTrustedSender` accepts only the
   game window's frame and origin.
3. Package with electron-builder or a similar tool, so players need no Node.js install.
4. Optionally require operating-system re-authentication (Windows Hello) in the main process before `reveal`, on top
   of the GM password check in the panel.

The Windows Credential Manager and macOS Keychain helpers are written to their documented interfaces but have not
been run on those systems here; the Linux path and the bridge are covered by tests with stand-ins.

## Files

- `src/player/gm-accounts.js`: account list, scrypt store, password rules, login limiter.
- `src/player/gm-service.js`: GM sign-in, password change, entering the GM character, commands, audit log.
- `src/player/player-session.js`, `src/server/persistence.js`, `src/multiplayer/snapshots.js`,
  `src/multiplayer/transport.js`, `src/shared/safety-limits.js`, `src/world/regions.js`,
  `src/server/plugin-host.js` and `server.js`: the small wiring changes.
- `public/gm.js` (plus hooks in `public/game.js` and `public/index.html`): F10, login, control panel, emblem, vault
  tab.
- `scripts/gm-provision.js`, `desktop/credential-vault.js`, `desktop/vault-ipc.js`, `desktop/preload.js`.
- Tests: `tests/gm-system.test.js` runs end to end on an isolated server with runtime-generated passwords.
  `tests/gm-accounts.test.js` covers the store, limiter, provisioning, vault and bridge.

Existing heroes saved under one of the three GM names, if any, are kept in `saves.json` untouched but can no longer be
opened through player login.
