// Client model for the Frost Wolf from plugins/frost_wolf.js. Reuse the built-in wolf body (public/enemy-models.js) with new colours.
Shardlands.addModel('frostwolf', { fn: (window.EnemyModels && EnemyModels.wolfModel) || beast, belly: hex('#eef8ff'), eye: [.45, .85, 1], kind: 'wolf', sc: 1.15, body: hex('#c8ecff'), leg: hex('#6fa3c8'), top: 46 });
