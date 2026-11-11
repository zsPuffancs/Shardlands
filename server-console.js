'use strict';
const readline = require('node:readline');
const RESTART_EXIT_CODE = 75;

class Command {
  constructor({ name, description, usage = name, maxArguments = 0, run }) {
    this.name = name;
    this.description = description;
    this.usage = usage;
    this.maxArguments = maxArguments;
    this.run = run;
  }

  async execute(args) {
    if (args.length > this.maxArguments) return 'Usage: ' + this.usage;
    return this.run(args);
  }
}

class CommandRegistry {
  constructor(commands) {
    this.commands = new Map(commands.map(command => [command.name, command]));
    if (this.commands.size !== commands.length) throw new Error('Duplicate console command');
  }

  async dispatch(line) {
    const input = line.trim();
    if (!input) return;
    const [name, ...args] = input.split(/\s+/);
    const command = this.commands.get(name.toLowerCase());
    if (!command) return 'Unknown command: ' + name + '. Type help for available commands.';
    try {
      return await command.execute(args);
    } catch (error) {
      console.error('Console command failed:', command.name, error);
      return 'Could not run ' + command.name + '. See the server log for details.';
    }
  }

  help(name) {
    if (name) {
      const command = this.commands.get(name.toLowerCase());
      return command ? command.usage + ' - ' + command.description : 'Unknown command: ' + name;
    }
    return [...this.commands.values()].map(command => command.usage + ' - ' + command.description).join('\n');
  }
}

function startServerConsole({ getStatus, save, shutdown, canRestart, reseed }) {
  const registry = new CommandRegistry([
    new Command({
      name: 'help',
      usage: 'help [command]',
      maxArguments: 1,
      description: 'Show available commands or help for one command.',
      run: ([name]) => registry.help(name),
    }),
    new Command({
      name: 'status',
      description: 'Show online players, monsters, and server tick timing.',
      run() {
        const { players, mobs, tickP95, tickMax } = getStatus();
        return 'Online: ' + players + ' | Monsters: ' + mobs + ' | Tick p95: ' + tickP95 + ' ms | Tick max: ' + tickMax + ' ms';
      },
    }),
    new Command({
      name: 'save',
      description: 'Save player and plugin data.',
      run: async () => (await save()) ? 'Server data saved.' : 'Save failed. See the server log for details.',
    }),
    new Command({
      name: 'restart',
      description: 'Save and restart the local server.',
      run: () => canRestart ? shutdown({ restart: true }) : 'Restart requires the local launcher. Use start.bat or start.sh.',
    }),
    new Command({
      name: 'reseed',
      usage: 'reseed confirm [seed]',
      maxArguments: 2,
      description: 'Found a new universe with a random (or chosen) world seed. Heroes and items are kept.',
      async run([confirmation, seed]) {
        if (!reseed) return 'This server cannot reseed its universe.';
        if (confirmation !== 'confirm') {
          return 'This founds a NEW universe: new seed, new map layout, World Tier 1, empty chronicle, generated maps gone.\n'
            + 'Heroes, levels, items, gold and souls are kept. The old universe is saved as a backup file.\n'
            + 'Type "reseed confirm" for a random seed, or "reseed confirm MY-SEED" to choose one.';
        }
        const result = await reseed(seed);
        console.log('New world seed: ' + result.seed + '. The old universe was saved as ' + result.backup + '.');
        if (canRestart) return shutdown({ restart: true });
        console.log('Start the server again to enter the new universe.');
        return shutdown();
      },
    }),
    new Command({
      name: 'stop',
      description: 'Save and stop the server.',
      run: () => shutdown(),
    }),
  ]);

  const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal, prompt: 'server> ' });
  let closed = false;
  input.on('close', () => { closed = true; });
  input.on('SIGINT', () => { void shutdown(); });
  console.log('Server console ready. Type help for available commands.');

  async function readCommands() {
    if (terminal) input.prompt();
    for await (const line of input) {
      const message = await registry.dispatch(line);
      if (message) console.log(message);
      if (terminal && !closed) input.prompt();
    }
  }
  readCommands().catch(error => console.error('Server console failed:', error));
  return input;
}

module.exports = { startServerConsole, RESTART_EXIT_CODE };
