import { GameState, Enemy, Player } from "../schema/GameState";

const STALKER_SPEED = 80;
const STALKER_DETECT_RADIUS = 200;
const STALKER_ATTACK_RADIUS = 40;
const STALKER_DAMAGE = 15;
const STALKER_ATTACK_COOLDOWN = 1.0;

const GUARDIAN_ATTACK_RADIUS = 100;
const GUARDIAN_DAMAGE = 25;
const GUARDIAN_ATTACK_COOLDOWN = 1.5;

export type EnemyCooldowns = Map<string, number>;
export type EnemyWanderData = Map<string, { timer: number; angle: number }>;

export interface EnemyAIContext {
  state: GameState;
  dt: number;
  cooldowns: EnemyCooldowns;
  wanderData: EnemyWanderData;
  onDamagePlayer: (sessionId: string, amount: number) => void;
}

export function tickEnemies(ctx: EnemyAIContext): void {
  ctx.state.enemies.forEach((enemy: Enemy, enemyId: string) => {
    if (enemy.isDead) return;

    // Tick attack cooldown
    const cd = ctx.cooldowns.get(enemyId) ?? 0;
    if (cd > 0) ctx.cooldowns.set(enemyId, cd - ctx.dt);

    if (enemy.enemyType === "stalker") {
      tickStalker(enemy, enemyId, ctx);
    } else if (enemy.enemyType === "guardian") {
      tickGuardian(enemy, enemyId, ctx);
    }
  });
}

function findClosestLivingPlayer(
  enemy: Enemy,
  state: GameState,
): { sessionId: string; player: Player; dist: number } | null {
  let closest: { sessionId: string; player: Player; dist: number } | null = null;

  state.players.forEach((player: Player, sessionId: string) => {
    if (player.isDead || player.extracted) return;
    const dx = player.x + 16 - enemy.x;
    const dy = player.y + 16 - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (!closest || dist < closest.dist) {
      closest = { sessionId, player, dist };
    }
  });

  return closest;
}

function tickStalker(enemy: Enemy, enemyId: string, ctx: EnemyAIContext): void {
  const target = findClosestLivingPlayer(enemy, ctx.state);

  if (target && target.dist < STALKER_ATTACK_RADIUS) {
    // Attack
    enemy.aiState = "attack";
    enemy.targetId = target.sessionId;
    const cd = ctx.cooldowns.get(enemyId) ?? 0;
    if (cd <= 0) {
      ctx.onDamagePlayer(target.sessionId, STALKER_DAMAGE);
      ctx.cooldowns.set(enemyId, STALKER_ATTACK_COOLDOWN);
    }
  } else if (target && target.dist < STALKER_DETECT_RADIUS) {
    // Chase
    enemy.aiState = "chase";
    enemy.targetId = target.sessionId;
    const dx = target.player.x + 16 - enemy.x;
    const dy = target.player.y + 16 - enemy.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const speed = STALKER_SPEED * enemy.speedMultiplier;
      enemy.x += (dx / len) * speed * ctx.dt;
      enemy.y += (dy / len) * speed * ctx.dt;
      enemy.facing = Math.atan2(dy, dx);
    }
  } else {
    // Wander
    enemy.aiState = "wander";
    enemy.targetId = "";

    let wd = ctx.wanderData.get(enemyId);
    if (!wd) {
      wd = { timer: 0, angle: Math.random() * Math.PI * 2 };
      ctx.wanderData.set(enemyId, wd);
    }

    wd.timer -= ctx.dt;
    if (wd.timer <= 0) {
      wd.angle = Math.random() * Math.PI * 2;
      wd.timer = 1.5 + Math.random();
    }

    const speed = STALKER_SPEED * 0.4 * enemy.speedMultiplier;
    enemy.x += Math.cos(wd.angle) * speed * ctx.dt;
    enemy.y += Math.sin(wd.angle) * speed * ctx.dt;
    enemy.facing = wd.angle;
  }

  // Clamp to map bounds
  enemy.x = Math.max(20, Math.min(ctx.state.mapWidth - 20, enemy.x));
  enemy.y = Math.max(20, Math.min(ctx.state.mapHeight - 20, enemy.y));
}

function tickGuardian(enemy: Enemy, enemyId: string, ctx: EnemyAIContext): void {
  const target = findClosestLivingPlayer(enemy, ctx.state);

  if (target && target.dist < GUARDIAN_ATTACK_RADIUS) {
    enemy.aiState = "attack";
    enemy.targetId = target.sessionId;
    enemy.facing = Math.atan2(
      target.player.y + 16 - enemy.y,
      target.player.x + 16 - enemy.x,
    );
    const cd = ctx.cooldowns.get(enemyId) ?? 0;
    if (cd <= 0) {
      ctx.onDamagePlayer(target.sessionId, GUARDIAN_DAMAGE);
      ctx.cooldowns.set(enemyId, GUARDIAN_ATTACK_COOLDOWN);
    }
  } else {
    enemy.aiState = "wander";
    enemy.targetId = "";
  }
}

export function damageEnemy(enemy: Enemy, amount: number): void {
  enemy.hp = Math.max(0, enemy.hp - amount);
  if (enemy.hp <= 0) {
    enemy.isDead = true;
  }
}
