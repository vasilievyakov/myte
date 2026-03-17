import { Schema, MapSchema, type } from "@colyseus/schema";

export class LootItem extends Schema {
  @type("string")  id: string = "";
  @type("string")  defId: string = "";
  @type("number")  x: number = 0;
  @type("number")  y: number = 0;
  @type("boolean") onGround: boolean = true;
  @type("string")  rarity: string = "common";
  @type("string")  itemType: string = "";
  @type("string")  name: string = "";
  @type("uint32")  color: number = 0xffffff;
}

export class Disaster extends Schema {
  @type("string")  id: string = "";
  @type("string")  disasterType: string = "blizzard";
  @type("number")  x: number = 0;
  @type("number")  y: number = 0;
  @type("number")  radius: number = 300;
  @type("string")  phase: string = "warning";
  @type("number")  phaseTimer: number = 0;
  @type("number")  subEventTimer: number = 0;
  @type("number")  lastStrikeX: number = 0;
  @type("number")  lastStrikeY: number = 0;
  @type("number")  strikeSeq: number = 0;
}

export class Player extends Schema {
  @type("number")  x: number = 0;
  @type("number")  y: number = 0;
  @type("number")  speed: number = 200;
  @type("uint32")  color: number = 0xffffff;
  @type("string")  weaponId: string = "";
  @type("string")  armorId: string = "";
  @type("string")  utilityId: string = "";
  @type("number")  speedMultiplier: number = 1.0;
  @type("boolean") extracted: boolean = false;
  @type("boolean") isReady: boolean = false;
  @type("number")  kills: number = 0;
  @type("number")  hp: number = 100;
  @type("number")  maxHp: number = 100;
  @type("boolean") isDead: boolean = false;
  @type("number")  respawnTimer: number = 0;
  @type("number")  graceTimer: number = 0;
  @type("number")  velX: number = 0;
  @type("number")  velY: number = 0;
  @type("number")  attackCooldown: number = 0;
  @type("number")  attackSeq: number = 0;
}

export class Enemy extends Schema {
  @type("string")  id: string = "";
  @type("string")  enemyType: string = "stalker";
  @type("number")  x: number = 0;
  @type("number")  y: number = 0;
  @type("number")  hp: number = 50;
  @type("number")  maxHp: number = 50;
  @type("string")  aiState: string = "wander";
  @type("string")  targetId: string = "";
  @type("number")  facing: number = 0;
  @type("number")  speedMultiplier: number = 1.0;
  @type("boolean") isDead: boolean = false;
}

export class GameState extends Schema {
  @type({ map: Player })   players = new MapSchema<Player>();
  @type({ map: LootItem })  items = new MapSchema<LootItem>();
  @type({ map: Disaster })  disasters = new MapSchema<Disaster>();
  @type({ map: Enemy })     enemies = new MapSchema<Enemy>();
  @type("number") mapWidth: number = 1600;
  @type("number") mapHeight: number = 1200;
  @type("number") sessionTimer: number = 300;
  @type("number") extractX: number = 800;
  @type("number") extractY: number = 600;
  @type("number") extractRadius: number = 80;
  @type("string") gamePhase: string = "lobby";
}
