import { Room, Client } from "colyseus";
import { GameState, Player, LootItem, Disaster, Enemy } from "../schema/GameState";
import { ITEM_DEFS, MUTATION_TABLE, SAFE_ZONE_POOL, MEDIUM_ZONE_POOL, DANGER_ZONE_POOL } from "../data/ItemDefs";
import { randomPositionInZone } from "../data/ZoneDefs";
import { tickEnemies, damageEnemy, EnemyCooldowns, EnemyWanderData } from "../systems/EnemyAI";
import { DISASTER_DEFS, DISASTER_ROTATION } from "../data/DisasterDefs";

const PLAYER_COLORS = [0x9b59b6, 0x1abc9c, 0xf1c40f, 0xe74c3c];
const PLAYER_SIZE = 32;
const TICK_RATE = 1000 / 60;

const PICKUP_RADIUS = 48;
const SESSION_DURATION = 300;
const DISASTER_INTERVAL_MIN = 8;
const DISASTER_INTERVAL_MAX = 12;
const BLIZZARD_SLOW = 0.5;
const ICE_FRICTION = 0.92;
const ICE_ACCEL = 0.4;
const RESPAWN_DURATION = 3;
const GRACE_DURATION = 2;
const HEALTH_POTION_HEAL = 50;
const BLIZZARD_DPS = 5;

const SAFE_CORNERS = [
  { x: 80, y: 80 },
  { x: 1520, y: 80 },
  { x: 80, y: 1120 },
  { x: 1520, y: 1120 },
];

interface MoveMessage {
  dx: number;
  dy: number;
}

export class GameRoom extends Room<{ state: GameState }> {
  maxClients = 4;
  private playerInputs = new Map<string, { dx: number; dy: number }>();
  private itemCounter = 0;
  private disasterCounter = 0;
  private enemyCounter = 0;
  private enemyCooldowns: EnemyCooldowns = new Map();
  private enemyWanderData: EnemyWanderData = new Map();
  private disasterRotationIndex = 0;

  onCreate() {
    this.setState(new GameState());
    this.setPatchRate(33);

    // Game starts in "lobby" phase — loot/enemies/disasters spawn on startGame()

    // Session timer (1 tick per second) — only ticks during playing/extractWarn
    this.clock.setInterval(() => {
      if (this.state.gamePhase !== "playing" && this.state.gamePhase !== "extractWarn") return;
      this.state.sessionTimer -= 1;
      if (this.state.sessionTimer % 30 === 0) {
        console.log(`[TIMER] ${this.state.sessionTimer}s remaining`);
      }
      if (this.state.sessionTimer <= 60 && this.state.gamePhase === "playing") {
        this.state.gamePhase = "extractWarn";
        this.broadcast("extract_warn");
        console.log("[GAME] Extract warning phase!");
      }
      if (this.state.sessionTimer <= 0) {
        this.endSession();
      }
    }, 1000);

    // --- Message handlers ---

    this.onMessage("ready", (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.gamePhase !== "lobby") return;
      player.isReady = true;
      console.log(`[LOBBY] Player ${client.sessionId} is ready`);

      // Check if all players ready (min 1)
      let allReady = true;
      this.state.players.forEach((p: Player) => {
        if (!p.isReady) allReady = false;
      });
      if (allReady && this.state.players.size >= 1) {
        this.startCountdown();
      }
    });

    this.onMessage("move", (client: Client, data: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.extracted || player.isDead) return;
      const dx = Math.max(-1, Math.min(1, Math.round(data.dx)));
      const dy = Math.max(-1, Math.min(1, Math.round(data.dy)));
      this.playerInputs.set(client.sessionId, { dx, dy });
    });

    this.onMessage("pickup", (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.extracted || player.isDead) return;

      // Find closest ground item within radius
      let closest: LootItem | null = null;
      let closestDist = PICKUP_RADIUS;

      this.state.items.forEach((item: LootItem) => {
        if (!item.onGround) return;
        const dx = (player.x + PLAYER_SIZE / 2) - item.x;
        const dy = (player.y + PLAYER_SIZE / 2) - item.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = item;
        }
      });

      if (!closest) return;

      const item = closest as LootItem;

      // Consumables: heal immediately and destroy
      if (item.defId === "health_potion" || item.defId === "bandage") {
        player.hp = Math.min(player.hp + HEALTH_POTION_HEAL, player.maxHp);
        this.state.items.delete(item.id);
        return;
      }

      const slotKey = `${item.itemType}Id` as "weaponId" | "armorId" | "utilityId";

      // Drop old item from slot if occupied
      const oldItemId = player[slotKey];
      if (oldItemId) {
        const oldItem = this.state.items.get(oldItemId);
        if (oldItem) {
          oldItem.onGround = true;
          oldItem.x = player.x + (Math.random() * 60 - 30);
          oldItem.y = player.y + (Math.random() * 60 - 30);
        }
      }

      // Pick up new item
      player[slotKey] = item.id;
      item.onGround = false;
    });

    this.onMessage("extract", (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.extracted || player.isDead) return;

      const dx = (player.x + PLAYER_SIZE / 2) - this.state.extractX;
      const dy = (player.y + PLAYER_SIZE / 2) - this.state.extractY;
      if (Math.sqrt(dx * dx + dy * dy) < this.state.extractRadius) {
        player.extracted = true;
        player.speedMultiplier = 0;

        // Check if all players extracted
        let allExtracted = true;
        this.state.players.forEach((p: Player) => {
          if (!p.extracted) allExtracted = false;
        });
        if (allExtracted) this.endSession();
      }
    });

    // Attack handler — player swings weapon at nearby enemies
    this.onMessage("attack", (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.extracted || player.isDead || player.attackCooldown > 0) return;

      const weaponId = player.weaponId;
      const weaponDef = weaponId ? this.state.items.get(weaponId) : null;
      const baseDmg = weaponDef ? this.getWeaponDamage(weaponDef.defId) : 5; // fist = 5
      const range = weaponDef ? 60 : 40;
      player.attackCooldown = weaponDef ? 0.5 : 0.8; // cooldown in seconds
      player.attackSeq++;

      const px = player.x + PLAYER_SIZE / 2;
      const py = player.y + PLAYER_SIZE / 2;

      this.state.enemies.forEach((enemy: Enemy) => {
        if (enemy.isDead) return;
        const dx = enemy.x - px;
        const dy = enemy.y - py;
        if (Math.sqrt(dx * dx + dy * dy) < range) {
          damageEnemy(enemy, baseDmg);
          if (enemy.hp <= 0) {
            player.kills++;
            this.dropEnemyLoot(enemy);
          }
        }
      });
    });

    // Use utility handler
    this.onMessage("use_utility", (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.extracted || player.isDead) return;
      const utilId = player.utilityId;
      if (!utilId) return;
      const item = this.state.items.get(utilId);
      if (!item) return;

      let consumed = false;
      switch (item.defId) {
        case "speed_scroll":
        case "spark_scroll":
        case "blizzard_scroll":
          player.speedMultiplier = 2.0;
          // Reset after 5 seconds
          this.clock.setTimeout(() => { player.speedMultiplier = 1.0; }, 5000);
          consumed = true;
          break;
        case "smoke_bomb":
          // Grace period (invulnerability) for 3 seconds
          player.graceTimer = 3;
          consumed = true;
          break;
        case "frost_ward":
          // Full heal
          player.hp = player.maxHp;
          consumed = true;
          break;
        case "torch":
        case "ember_flask":
          // Damage nearby enemies
          this.state.enemies.forEach((enemy: Enemy) => {
            if (enemy.isDead) return;
            const dx = enemy.x - (player.x + PLAYER_SIZE / 2);
            const dy = enemy.y - (player.y + PLAYER_SIZE / 2);
            if (Math.sqrt(dx * dx + dy * dy) < 100) {
              damageEnemy(enemy, 30);
            }
          });
          consumed = true;
          break;
        case "antidote":
        case "cryo_flask":
        case "volt_potion":
          player.hp = Math.min(player.hp + 30, player.maxHp);
          consumed = true;
          break;
        case "grapple_hook":
          // Dash forward in last move direction
          const input = this.playerInputs.get(client.sessionId);
          if (input && (input.dx !== 0 || input.dy !== 0)) {
            player.x += input.dx * 200;
            player.y += input.dy * 200;
            player.x = Math.max(0, Math.min(this.state.mapWidth - PLAYER_SIZE, player.x));
            player.y = Math.max(0, Math.min(this.state.mapHeight - PLAYER_SIZE, player.y));
          }
          consumed = true;
          break;
        case "compass":
          // Not consumed — passive (no active use)
          break;
        default:
          // Generic utility: small heal
          player.hp = Math.min(player.hp + 15, player.maxHp);
          consumed = true;
          break;
      }

      if (consumed) {
        player.utilityId = "";
        this.state.items.delete(utilId);
      }
    });

    // --- Simulation loop ---

    this.setSimulationInterval((deltaTime) => {
      if (this.state.gamePhase !== "playing" && this.state.gamePhase !== "extractWarn") return;
      const dt = deltaTime / 1000;

      // Death/respawn/grace/attack cooldown ticking
      this.state.players.forEach((player: Player, sessionId: string) => {
        if (player.isDead) {
          player.respawnTimer -= dt;
          if (player.respawnTimer <= 0) {
            this.respawnPlayer(sessionId);
          }
          return;
        }
        if (player.graceTimer > 0) {
          player.graceTimer -= dt;
          if (player.graceTimer < 0) player.graceTimer = 0;
        }
        if (player.attackCooldown > 0) {
          player.attackCooldown -= dt;
          if (player.attackCooldown < 0) player.attackCooldown = 0;
        }
      });

      // Player movement
      this.state.players.forEach((player: Player, sessionId: string) => {
        if (player.extracted || player.isDead) return;
        const input = this.playerInputs.get(sessionId);
        if (!input || (input.dx === 0 && input.dy === 0)) return;

        let { dx, dy } = input;
        if (dx !== 0 && dy !== 0) {
          const len = Math.sqrt(dx * dx + dy * dy);
          dx /= len;
          dy /= len;
        }

        player.x += dx * player.speed * player.speedMultiplier * dt;
        player.y += dy * player.speed * player.speedMultiplier * dt;

        player.x = Math.max(0, Math.min(this.state.mapWidth - PLAYER_SIZE, player.x));
        player.y = Math.max(0, Math.min(this.state.mapHeight - PLAYER_SIZE, player.y));
      });

      // Enemy AI tick
      tickEnemies({
        state: this.state,
        dt,
        cooldowns: this.enemyCooldowns,
        wanderData: this.enemyWanderData,
        onDamagePlayer: (sid, dmg) => this.damagePlayer(sid, dmg),
      });

      // Enemy disaster effects (blizzard slows enemies)
      this.state.enemies.forEach((enemy: Enemy) => {
        if (enemy.isDead) return;
        let inBlizzard = false;
        this.state.disasters.forEach((disaster: Disaster) => {
          if (disaster.phase !== "active") return;
          const dx = enemy.x - disaster.x;
          const dy = enemy.y - disaster.y;
          if (Math.sqrt(dx * dx + dy * dy) < disaster.radius) {
            if (disaster.disasterType === "blizzard") inBlizzard = true;
          }
        });
        enemy.speedMultiplier = inBlizzard ? BLIZZARD_SLOW : 1.0;
      });

      // Disaster effects on players
      this.state.players.forEach((player: Player, sessionId: string) => {
        if (player.extracted || player.isDead) return;
        let inBlizzard = false;
        let inIce = false;
        this.state.disasters.forEach((disaster: Disaster) => {
          if (disaster.phase !== "active") return;
          const dx = (player.x + PLAYER_SIZE / 2) - disaster.x;
          const dy = (player.y + PLAYER_SIZE / 2) - disaster.y;
          if (Math.sqrt(dx * dx + dy * dy) < disaster.radius) {
            if (disaster.disasterType === "blizzard") inBlizzard = true;
            if (disaster.disasterType === "ice") inIce = true;
          }
        });

        if (inIce) {
          // Ice sliding physics
          const input = this.playerInputs.get(sessionId);
          if (input) {
            player.velX += input.dx * player.speed * dt * ICE_ACCEL;
            player.velY += input.dy * player.speed * dt * ICE_ACCEL;
          }
          player.velX *= ICE_FRICTION;
          player.velY *= ICE_FRICTION;
          player.x += player.velX * dt;
          player.y += player.velY * dt;
          player.x = Math.max(0, Math.min(this.state.mapWidth - PLAYER_SIZE, player.x));
          player.y = Math.max(0, Math.min(this.state.mapHeight - PLAYER_SIZE, player.y));
          player.speedMultiplier = 0.8;
        } else {
          player.velX = 0;
          player.velY = 0;
          player.speedMultiplier = inBlizzard ? BLIZZARD_SLOW : 1.0;
        }

        if (inBlizzard) {
          this.damagePlayer(sessionId, BLIZZARD_DPS * dt);
        }
      });

      // Disaster phase progression + sub-events
      const toDelete: string[] = [];
      this.state.disasters.forEach((disaster: Disaster, id: string) => {
        disaster.phaseTimer -= dt;

        if (disaster.phaseTimer <= 0) {
          if (disaster.phase === "warning") {
            const def = DISASTER_DEFS[disaster.disasterType];
            disaster.phase = "active";
            disaster.phaseTimer = def?.activeDuration ?? 15;
            this.mutateItemsInZone(disaster);
          } else if (disaster.phase === "active") {
            toDelete.push(id);
          }
        }

        // Sub-events for meteor and lightning
        if (disaster.phase === "active") {
          const def = DISASTER_DEFS[disaster.disasterType];
          if (def?.subEventInterval) {
            disaster.subEventTimer -= dt;
            if (disaster.subEventTimer <= 0) {
              disaster.subEventTimer = def.subEventInterval;
              this.fireSubEvent(disaster, def);
            }
          }
        }
      });
      for (const id of toDelete) {
        this.state.disasters.delete(id);
        this.scheduleDisaster();
      }
    }, TICK_RATE);
  }

  onJoin(client: Client) {
    const player = new Player();
    player.x = 100 + Math.random() * (this.state.mapWidth - 200);
    player.y = 100 + Math.random() * (this.state.mapHeight - 200);
    const colorIndex = this.state.players.size;
    player.color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];

    this.state.players.set(client.sessionId, player);
    this.playerInputs.set(client.sessionId, { dx: 0, dy: 0 });
    console.log(`Player joined: ${client.sessionId}`);
  }

  onLeave(client: Client) {
    // Drop all items back to ground
    const player = this.state.players.get(client.sessionId);
    if (player) {
      for (const slotKey of ["weaponId", "armorId", "utilityId"] as const) {
        const itemId = player[slotKey];
        if (itemId) {
          const item = this.state.items.get(itemId);
          if (item) {
            item.onGround = true;
            item.x = player.x + (Math.random() * 60 - 30);
            item.y = player.y + (Math.random() * 60 - 30);
          }
        }
      }
    }
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    console.log(`Player left: ${client.sessionId}`);
  }

  // --- Private methods ---

  private startCountdown() {
    this.state.gamePhase = "countdown";
    this.broadcast("countdown", { seconds: 3 });
    let count = 3;
    const interval = this.clock.setInterval(() => {
      count--;
      if (count > 0) {
        this.broadcast("countdown", { seconds: count });
      } else {
        interval.clear();
        this.startGame();
      }
    }, 1000);
  }

  private startGame() {
    console.log("[GAME] Starting game!");
    this.state.gamePhase = "playing";
    this.state.sessionTimer = SESSION_DURATION;
    this.spawnInitialLoot();
    this.spawnInitialEnemies();
    this.scheduleDisaster();
  }

  private dropEnemyLoot(enemy: Enemy) {
    // Guardians drop better loot
    const pool = enemy.enemyType === "guardian" ? DANGER_ZONE_POOL : MEDIUM_ZONE_POOL;
    const defId = pool[Math.floor(Math.random() * pool.length)];
    this.spawnItem(defId, enemy.x + (Math.random() * 40 - 20), enemy.y + (Math.random() * 40 - 20));
  }

  private damagePlayer(sessionId: string, amount: number) {
    const player = this.state.players.get(sessionId);
    if (!player || player.isDead || player.extracted || player.graceTimer > 0) return;
    player.hp -= amount;
    if (player.hp <= 0) {
      player.hp = 0;
      this.killPlayer(sessionId);
    }
  }

  private killPlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    player.isDead = true;
    player.respawnTimer = RESPAWN_DURATION;
    player.speedMultiplier = 0;

    // Drop all items back to ground
    for (const slotKey of ["weaponId", "armorId", "utilityId"] as const) {
      const itemId = player[slotKey];
      if (itemId) {
        const item = this.state.items.get(itemId);
        if (item) {
          item.onGround = true;
          item.x = player.x + (Math.random() * 60 - 30);
          item.y = player.y + (Math.random() * 60 - 30);
        }
        player[slotKey] = "";
      }
    }
  }

  private respawnPlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    player.isDead = false;
    player.hp = player.maxHp;
    player.graceTimer = GRACE_DURATION;
    player.speedMultiplier = 1.0;
    player.respawnTimer = 0;

    // Teleport to a safe corner
    const corner = SAFE_CORNERS[Math.floor(Math.random() * SAFE_CORNERS.length)];
    player.x = corner.x + (Math.random() * 40 - 20);
    player.y = corner.y + (Math.random() * 40 - 20);
  }

  private spawnInitialEnemies() {
    // 6 stalkers — biased toward center
    for (let i = 0; i < 6; i++) {
      const x = 300 + Math.random() * (this.state.mapWidth - 600);
      const y = 300 + Math.random() * (this.state.mapHeight - 600);
      this.spawnEnemy("stalker", x, y, 50);
    }
    // 3 guardians — near center (danger zone)
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * 250;
      const x = this.state.mapWidth / 2 + Math.cos(angle) * dist;
      const y = this.state.mapHeight / 2 + Math.sin(angle) * dist;
      this.spawnEnemy("guardian", x, y, 80);
    }
  }

  private spawnEnemy(type: string, x: number, y: number, hp: number): Enemy {
    const enemy = new Enemy();
    enemy.id = `enemy_${++this.enemyCounter}`;
    enemy.enemyType = type;
    enemy.x = x;
    enemy.y = y;
    enemy.hp = hp;
    enemy.maxHp = hp;
    this.state.enemies.set(enemy.id, enemy);
    return enemy;
  }

  private spawnInitialLoot() {
    // Safe zone: 10 items
    for (let i = 0; i < 10; i++) {
      const defId = SAFE_ZONE_POOL[Math.floor(Math.random() * SAFE_ZONE_POOL.length)];
      const pos = randomPositionInZone("safe");
      this.spawnItem(defId, pos.x, pos.y);
    }
    // Medium zone: 10 items
    for (let i = 0; i < 10; i++) {
      const defId = MEDIUM_ZONE_POOL[Math.floor(Math.random() * MEDIUM_ZONE_POOL.length)];
      const pos = randomPositionInZone("medium");
      this.spawnItem(defId, pos.x, pos.y);
    }
    // Danger zone: 6 items (better loot, fewer)
    for (let i = 0; i < 6; i++) {
      const defId = DANGER_ZONE_POOL[Math.floor(Math.random() * DANGER_ZONE_POOL.length)];
      const pos = randomPositionInZone("danger");
      this.spawnItem(defId, pos.x, pos.y);
    }
  }

  private spawnItem(defId: string, x?: number, y?: number): LootItem {
    const def = ITEM_DEFS[defId];
    const item = new LootItem();
    item.id = `loot_${++this.itemCounter}`;
    item.defId = defId;
    item.name = def.name;
    item.rarity = def.rarity;
    item.itemType = def.type;
    item.color = def.color;
    item.onGround = true;
    item.x = x ?? 100 + Math.random() * (this.state.mapWidth - 200);
    item.y = y ?? 100 + Math.random() * (this.state.mapHeight - 200);
    this.state.items.set(item.id, item);
    return item;
  }

  private scheduleDisaster() {
    const delay = (DISASTER_INTERVAL_MIN +
      Math.random() * (DISASTER_INTERVAL_MAX - DISASTER_INTERVAL_MIN)) * 1000;

    console.log(`[DISASTER] Scheduled in ${Math.round(delay)}ms`);
    this.clock.setTimeout(() => {
      if (this.state.gamePhase !== "playing" && this.state.gamePhase !== "extractWarn") return;

      const typeName = DISASTER_ROTATION[this.disasterRotationIndex % DISASTER_ROTATION.length];
      this.disasterRotationIndex++;
      const def = DISASTER_DEFS[typeName];

      const disaster = new Disaster();
      disaster.id = `disaster_${++this.disasterCounter}`;
      disaster.disasterType = typeName;
      disaster.radius = def.radius;
      disaster.phase = "warning";
      disaster.phaseTimer = def.warningDuration;
      disaster.x = def.radius + Math.random() * (this.state.mapWidth - 2 * def.radius);
      disaster.y = def.radius + Math.random() * (this.state.mapHeight - 2 * def.radius);
      if (def.subEventInterval) {
        disaster.subEventTimer = def.subEventInterval;
      }

      this.state.disasters.set(disaster.id, disaster);
      console.log(`[DISASTER] ${typeName} ${disaster.id} created at (${Math.round(disaster.x)}, ${Math.round(disaster.y)})`);
    }, delay);
  }

  private fireSubEvent(disaster: Disaster, def: { subEventDamage?: number; subEventRadius?: number }) {
    // Pick random strike point within disaster zone
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * disaster.radius * 0.8;
    const sx = disaster.x + Math.cos(angle) * dist;
    const sy = disaster.y + Math.sin(angle) * dist;

    disaster.lastStrikeX = sx;
    disaster.lastStrikeY = sy;
    disaster.strikeSeq++;

    const dmg = def.subEventDamage ?? 0;
    const rad = def.subEventRadius ?? 100;

    // Damage players in strike radius
    this.state.players.forEach((player: Player, sessionId: string) => {
      if (player.isDead || player.extracted) return;
      const dx = (player.x + PLAYER_SIZE / 2) - sx;
      const dy = (player.y + PLAYER_SIZE / 2) - sy;
      if (Math.sqrt(dx * dx + dy * dy) < rad) {
        this.damagePlayer(sessionId, dmg);
      }
    });

    // Damage enemies in strike radius
    this.state.enemies.forEach((enemy: Enemy) => {
      if (enemy.isDead) return;
      const dx = enemy.x - sx;
      const dy = enemy.y - sy;
      if (Math.sqrt(dx * dx + dy * dy) < rad) {
        damageEnemy(enemy, dmg);
      }
    });

    // Meteor: spawn ore at impact site
    if (disaster.disasterType === "meteor") {
      if (ITEM_DEFS["meteor_ore"]) {
        this.spawnItem("meteor_ore", sx, sy);
      }
    }

    // Lightning: mutate items near strike
    if (disaster.disasterType === "lightning") {
      const mutations = MUTATION_TABLE["lightning"];
      if (mutations) {
        this.state.items.forEach((item: LootItem) => {
          if (!item.onGround) return;
          const dx = item.x - sx;
          const dy = item.y - sy;
          if (Math.sqrt(dx * dx + dy * dy) > rad) return;
          const newDefId = mutations[item.defId];
          if (!newDefId) return;
          const newDef = ITEM_DEFS[newDefId];
          if (!newDef) return;
          item.defId = newDefId;
          item.name = newDef.name;
          item.rarity = newDef.rarity;
          item.color = newDef.color;
        });
      }
    }
  }

  private mutateItemsInZone(disaster: Disaster) {
    const mutations = MUTATION_TABLE[disaster.disasterType];
    if (!mutations) return;

    this.state.items.forEach((item: LootItem) => {
      if (!item.onGround) return;
      const dx = item.x - disaster.x;
      const dy = item.y - disaster.y;
      if (Math.sqrt(dx * dx + dy * dy) > disaster.radius) return;

      const newDefId = mutations[item.defId];
      if (!newDefId) return;

      const newDef = ITEM_DEFS[newDefId];
      item.defId = newDefId;
      item.name = newDef.name;
      item.rarity = newDef.rarity;
      item.color = newDef.color;
    });
  }

  private endSession() {
    this.state.gamePhase = "ended";
    this.state.players.forEach((player: Player) => {
      player.extracted = true;
      player.speedMultiplier = 0;
    });
    this.broadcast("session_end", this.buildResults());
  }

  private buildResults(): any[] {
    const results: any[] = [];
    this.state.players.forEach((player: Player, sessionId: string) => {
      const items: any[] = [];
      for (const slotKey of ["weaponId", "armorId", "utilityId"] as const) {
        const itemId = player[slotKey];
        if (itemId) {
          const item = this.state.items.get(itemId);
          if (item) items.push({ name: item.name, rarity: item.rarity, type: item.itemType });
        }
      }
      const score = items.reduce((s, i) => s + (i.rarity === "rare" ? 30 : i.rarity === "uncommon" ? 15 : 5), 0) + player.kills * 10;
      results.push({ sessionId, color: player.color, items, kills: player.kills, score });
    });
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  private getWeaponDamage(defId: string): number {
    const dmgMap: Record<string, number> = {
      iron_sword: 12, fire_blade: 18, frost_edge: 22, bone_club: 10,
      rusty_bow: 14, staff: 16, dagger: 10, mace: 14, crossbow: 18,
      frozen_sword: 16, blizzard_fang: 24, storm_blade: 26,
      molten_blade: 28, magma_club: 16, crystal_saber: 26, ice_bow: 18,
    };
    return dmgMap[defId] ?? 10;
  }
}
