import Phaser from "phaser";
import { Client, Room, Callbacks } from "@colyseus/sdk";

const LERP_FACTOR = 0.35;
const PLAYER_SIZE = 32;
const GRID_SIZE = 64;
const PICKUP_RADIUS = 64;

interface PlayerSprite {
  gfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  shadow: Phaser.GameObjects.Ellipse;
  healthBarBg: Phaser.GameObjects.Rectangle;
  healthBarFill: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
  prevX: number;
  prevY: number;
  walkPhase: number;
  color: number;
  isMoving: boolean;
  facingLeft: boolean;
  hp: number;
  maxHp: number;
  isDead: boolean;
  graceTimer: number;
}

interface ItemSprite {
  gfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  bobPhase: number;
  baseY: number;
}

interface DisasterSprite {
  gfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  phase: string;
  disasterType: string;
  pulseTimer: number;
  particles: Phaser.GameObjects.Graphics;
  snowflakes: { x: number; y: number; vx: number; vy: number; size: number }[];
  cx: number;
  cy: number;
  radius: number;
  lastStrikeSeq: number;
}

interface EnemySprite {
  gfx: Phaser.GameObjects.Graphics;
  healthBarBg: Phaser.GameObjects.Rectangle;
  healthBarFill: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
  prevX: number;
  prevY: number;
  enemyType: string;
  aiState: string;
  facing: number;
  isDead: boolean;
  hp: number;
  maxHp: number;
}

export class GameScene extends Phaser.Scene {
  private room!: Room;
  private playerSprites = new Map<string, PlayerSprite>();
  private itemSprites = new Map<string, ItemSprite>();
  private disasterSprites = new Map<string, DisasterSprite>();
  private enemySprites = new Map<string, EnemySprite>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private pickupKey!: Phaser.Input.Keyboard.Key;
  private extractKey!: Phaser.Input.Keyboard.Key;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private useKey!: Phaser.Input.Keyboard.Key;
  private lastDirection = { dx: 0, dy: 0 };
  private localSessionId = "";

  // HUD
  private hudSlots: Phaser.GameObjects.Text[] = [];
  private hudSlotBgs: Phaser.GameObjects.Rectangle[] = [];
  private hudSlotIcons: Phaser.GameObjects.Graphics[] = [];
  private timerText!: Phaser.GameObjects.Text;
  private pickupHint!: Phaser.GameObjects.Text;
  private extractHint!: Phaser.GameObjects.Text;
  private resultsShown = false;
  private deathOverlayText: Phaser.GameObjects.Text | null = null;

  // Minimap
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private minimapBg!: Phaser.GameObjects.Rectangle;
  private minimapBorder!: Phaser.GameObjects.Rectangle;

  // Audio
  private audioCtx: AudioContext | null = null;

  // Zone tracking
  private wasInDangerZone = false;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { room?: Room }) {
    if (data.room) {
      this.room = data.room;
    }
  }

  create() {
    this.resultsShown = false;
    this.playerSprites.clear();
    this.itemSprites.clear();
    this.disasterSprites.clear();
    this.enemySprites.clear();

    this.drawArena(1600, 1200);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.pickupKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.extractKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.useKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

    this.createHUD();
    this.connectToServer();
  }

  // ========== HUD ==========

  private createHUD() {
    const w = this.scale.width;
    const h = this.scale.height;
    const slotWidth = 180;
    const slotHeight = 64;
    const slotLabels = ["WEAPON", "ARMOR", "UTILITY"];
    const startX = w / 2 - (slotWidth * 1.5 + 10);

    for (let i = 0; i < 3; i++) {
      const x = startX + i * (slotWidth + 10);
      const bg = this.add.rectangle(x + slotWidth / 2, h - 46, slotWidth, slotHeight, 0x111122, 0.92)
        .setScrollFactor(0).setDepth(100).setStrokeStyle(2, 0x333355);
      this.hudSlotBgs.push(bg);

      this.add.text(x + 34, h - 70, slotLabels[i], {
        fontSize: "11px", color: "#666688", fontFamily: "monospace",
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);

      const icon = this.add.graphics().setScrollFactor(0).setDepth(101);
      this.hudSlotIcons.push(icon);

      const content = this.add.text(x + 34, h - 42, "Empty", {
        fontSize: "16px", color: "#555555", fontStyle: "bold",
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);
      this.hudSlots.push(content);
    }

    this.timerText = this.add.text(w / 2, 20, "5:00", {
      fontSize: "32px", color: "#ffffff", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);

    this.pickupHint = this.add.text(w / 2, h - 115, "[E] Pick up", {
      fontSize: "18px", color: "#ffff00", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(100).setVisible(false);

    this.extractHint = this.add.text(w / 2, h - 140, "[SPACE] Extract", {
      fontSize: "18px", color: "#00ff66", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(100).setVisible(false);

    // Controls hint (bottom-left)
    this.add.text(12, h - 24, "[F] Attack   [Q] Use Utility   [E] Pick up   [SPACE] Extract", {
      fontSize: "12px", color: "#445566", fontFamily: "monospace",
    }).setScrollFactor(0).setDepth(100);

    // Minimap (top-left corner)
    const mmSize = 140;
    const mmX = 12;
    const mmY = 12;
    this.minimapBg = this.add.rectangle(mmX + mmSize / 2, mmY + mmSize / 2, mmSize, mmSize, 0x0a0a1a, 0.85)
      .setScrollFactor(0).setDepth(100);
    this.minimapBorder = this.add.rectangle(mmX + mmSize / 2, mmY + mmSize / 2, mmSize, mmSize)
      .setScrollFactor(0).setDepth(100).setFillStyle(0x000000, 0).setStrokeStyle(2, 0x333355);
    this.minimapGfx = this.add.graphics().setScrollFactor(0).setDepth(101);

    this.add.text(mmX + mmSize / 2, mmY + mmSize + 4, "MAP", {
      fontSize: "10px", color: "#444466", fontFamily: "monospace",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
  }

  // ========== CONNECTION ==========

  private async connectToServer() {
    try {
      if (!this.room) {
        const serverUrl = window.location.hostname === "localhost"
          ? "http://localhost:2567"
          : window.location.origin;
        const client = new Client(serverUrl);
        this.room = await client.joinOrCreate("game_room");
      }
      this.localSessionId = this.room.sessionId;
      console.log("Connected! Session:", this.localSessionId);

      const $ = Callbacks.get(this.room);

      // --- PLAYERS ---
      $.onAdd("players", (player: any, sessionId: unknown) => {
        const sid = sessionId as string;
        this.addPlayer(sid, player);
        $.onChange(player, () => {
          const s = this.playerSprites.get(sid);
          if (s) {
            s.targetX = player.x;
            s.targetY = player.y;

            // Detect HP decrease for floating damage number
            const oldHp = s.hp;
            s.hp = player.hp;
            s.maxHp = player.maxHp;
            s.isDead = player.isDead;
            s.graceTimer = player.graceTimer;

            if (player.hp < oldHp && oldHp - player.hp >= 1) {
              this.spawnFloatingText(s.prevX + 16, s.prevY - 20, `-${Math.round(oldHp - player.hp)}`, "#ff4444");
              if (sid === this.localSessionId) {
                this.playSfx("hit");
                this.cameras.main.shake(150, 0.008);
              }
            }
          }
        });
        if (sid === this.localSessionId) {
          $.listen(player, "weaponId", (val: string) => this.updateHUDSlot(0, val));
          $.listen(player, "armorId", (val: string) => this.updateHUDSlot(1, val));
          $.listen(player, "utilityId", (val: string) => this.updateHUDSlot(2, val));
          $.listen(player, "isDead", (val: boolean) => {
            if (val) { this.showDeathOverlay(); this.playSfx("death"); }
            else this.hideDeathOverlay();
          });
          $.listen(player, "attackSeq", () => {
            const s = this.playerSprites.get(this.localSessionId);
            if (s) this.spawnAttackVFX(s.prevX + 16, s.prevY + 16);
          });
        }
      });
      $.onRemove("players", (_: any, key: unknown) => this.removePlayer(key as string));

      // --- ITEMS ---
      $.onAdd("items", (item: any, _id: unknown) => {
        const id = _id as string;
        if (item.onGround) this.addItemSprite(id, item);
        $.listen(item, "onGround", (v: boolean) => v ? this.addItemSprite(id, item) : this.removeItemSprite(id));
        $.listen(item, "color", () => this.updateItemSprite(id, item));
        $.listen(item, "name", () => this.updateItemSprite(id, item));
      });
      $.onRemove("items", (_: any, key: unknown) => this.removeItemSprite(key as string));

      // --- DISASTERS ---
      $.onAdd("disasters", (disaster: any, _id: unknown) => {
        const id = _id as string;
        console.log("[CLIENT] Disaster added:", id, disaster.phase);
        this.addDisasterSprite(id, disaster);
        // Flash notification
        const flash = this.add.text(this.scale.width / 2, this.scale.height / 2 - 50,
          "BLIZZARD INCOMING!", {
            fontSize: "32px", color: "#00ccff", fontStyle: "bold",
            stroke: "#000033", strokeThickness: 5,
          }).setOrigin(0.5).setScrollFactor(0).setDepth(150);
        this.tweens.add({ targets: flash, alpha: 0, y: flash.y - 40, duration: 3000, onComplete: () => flash.destroy() });

        $.onChange(disaster, () => {
          const s = this.disasterSprites.get(id);
          if (!s) return;
          if (s.phase !== disaster.phase) {
            s.phase = disaster.phase;
            this.updateDisasterPhase(id, disaster);
          }
          // Detect sub-event strikes (meteor/lightning)
          if (disaster.strikeSeq !== undefined && disaster.strikeSeq !== s.lastStrikeSeq) {
            s.lastStrikeSeq = disaster.strikeSeq;
            this.spawnStrikeVFX(disaster.lastStrikeX, disaster.lastStrikeY, s.disasterType);
          }
        });
      });
      $.onRemove("disasters", (_: any, key: unknown) => this.removeDisasterSprite(key as string));

      // --- ENEMIES ---
      $.onAdd("enemies", (enemy: any, _eid: unknown) => {
        const eid = _eid as string;
        this.addEnemySprite(eid, enemy);
        $.onChange(enemy, () => {
          const s = this.enemySprites.get(eid);
          if (s) {
            s.targetX = enemy.x;
            s.targetY = enemy.y;
            s.aiState = enemy.aiState;
            s.facing = enemy.facing;
            s.hp = enemy.hp;
            s.maxHp = enemy.maxHp;
            if (enemy.isDead && !s.isDead) {
              // Enemy just died — flash
              s.isDead = true;
              this.spawnFloatingText(s.prevX, s.prevY - 10, "DEAD", "#ff8800");
            }
            s.isDead = enemy.isDead;
          }
        });
      });
      $.onRemove("enemies", (_: any, key: unknown) => this.removeEnemySprite(key as string));

      // --- SESSION STATE ---
      $.onChange(this.room.state, () => {
        const state = this.room.state as any;
        if (state.sessionTimer !== undefined) {
          const min = Math.floor(state.sessionTimer / 60);
          const sec = Math.floor(state.sessionTimer % 60);
          this.timerText.setText(`${min}:${sec.toString().padStart(2, "0")}`);
          if (state.sessionTimer <= 30) this.timerText.setColor("#ff4444");
        }
      });

      this.drawExtractionZone(
        this.room.state.extractX, this.room.state.extractY, this.room.state.extractRadius,
      );

      this.room.onMessage("session_end", (results: any[]) => {
        this.scene.start("LootRevealScene", {
          results,
          localSessionId: this.localSessionId,
        });
      });

      // Countdown handler (#11)
      this.room.onMessage("countdown", (data: { seconds: number }) => {
        this.initAudio();
        const text = data.seconds > 0 ? `${data.seconds}` : "GO!";
        const countText = this.add.text(this.scale.width / 2, this.scale.height / 2, text, {
          fontSize: "80px", color: "#ffffff", fontStyle: "bold",
          stroke: "#000000", strokeThickness: 6,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
        this.tweens.add({
          targets: countText, alpha: 0, scaleX: 2, scaleY: 2,
          duration: 800, ease: "Power2",
          onComplete: () => countText.destroy(),
        });
        // Beep sound
        if (this.audioCtx) {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.connect(gain); gain.connect(this.audioCtx.destination);
          osc.type = "sine";
          osc.frequency.setValueAtTime(data.seconds > 0 ? 440 : 880, this.audioCtx.currentTime);
          gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
          gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.15);
          osc.start(); osc.stop(this.audioCtx.currentTime + 0.15);
        }
      });

      // Extract warning handler
      this.room.onMessage("extract_warn", () => {
        const flash = this.add.text(this.scale.width / 2, this.scale.height / 2 - 80,
          "60 SECONDS - GET TO EXTRACTION!", {
            fontSize: "28px", color: "#ff6600", fontStyle: "bold",
            stroke: "#000000", strokeThickness: 4,
          }).setOrigin(0.5).setScrollFactor(0).setDepth(150);
        this.tweens.add({ targets: flash, alpha: 0, y: flash.y - 50, duration: 4000, onComplete: () => flash.destroy() });
        this.timerText.setColor("#ff6600");
      });

    } catch (e) {
      console.error("Connection failed:", e);
      this.add.text(400, 300, "Connection failed!\nStart the server first.", {
        fontSize: "20px", color: "#ff4444", align: "center",
      }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
    }
  }

  // ========== PLAYER RENDERING (animated character) ==========

  private addPlayer(sessionId: string, player: any) {
    const isLocal = sessionId === this.localSessionId;
    const color = player.color;

    // Shadow under character
    const shadow = this.add.ellipse(player.x + 16, player.y + 38, 24, 8, 0x000000, 0.3).setDepth(9);

    // Character graphics
    const gfx = this.add.graphics().setDepth(10);
    this.drawCharacter(gfx, player.x, player.y, color, 0, false);

    const labelText = isLocal ? "YOU" : sessionId.slice(0, 4);
    const label = this.add.text(player.x + 16, player.y - 8, labelText, {
      fontSize: "11px", color: "#ffffff", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(11);

    // Health bar
    const healthBarBg = this.add.rectangle(player.x + 16 - 14, player.y - 14, 28, 4, 0x333333, 0.8)
      .setOrigin(0, 0.5).setDepth(12);
    const healthBarFill = this.add.rectangle(player.x + 16 - 14, player.y - 14, 28, 4, 0xff3333, 1)
      .setOrigin(0, 0.5).setDepth(12);

    const sprite: PlayerSprite = {
      gfx, label, shadow, healthBarBg, healthBarFill,
      targetX: player.x, targetY: player.y,
      prevX: player.x, prevY: player.y,
      walkPhase: 0, color, isMoving: false, facingLeft: false,
      hp: player.hp ?? 100, maxHp: player.maxHp ?? 100,
      isDead: player.isDead ?? false, graceTimer: player.graceTimer ?? 0,
    };
    this.playerSprites.set(sessionId, sprite);

    if (isLocal) {
      this.cameras.main.setZoom(0.75);
      this.cameras.main.setBounds(0, 0, 1600, 1200);
    }
  }

  private drawCharacter(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number, walkPhase: number, facingLeft: boolean, isDead = false, graceTimer = 0) {
    gfx.clear();
    const cx = x + 16; // center x

    // Dead: draw X marker
    if (isDead) {
      gfx.lineStyle(4, 0x666666, 0.4);
      gfx.strokeLineShape(new Phaser.Geom.Line(cx - 10, y + 10, cx + 10, y + 30));
      gfx.strokeLineShape(new Phaser.Geom.Line(cx + 10, y + 10, cx - 10, y + 30));
      return;
    }

    // Grace period: shield bubble + flicker (#15)
    if (graceTimer > 0) {
      gfx.setAlpha(0.9);
      // Shield bubble
      gfx.lineStyle(2, 0x44aaff, 0.4 + Math.sin(Date.now() * 0.01) * 0.3);
      gfx.strokeCircle(cx, y + 16, 22);
      gfx.fillStyle(0x44aaff, 0.08);
      gfx.fillCircle(cx, y + 16, 22);
    } else {
      gfx.setAlpha(1);
    }

    const legSwing = Math.sin(walkPhase) * 5;
    const bodyBob = Math.abs(Math.sin(walkPhase)) * 1.5;
    const armSwing = Math.sin(walkPhase) * 8;

    // Darker shade for outlines
    const dark = Phaser.Display.Color.IntegerToColor(color);
    const darkColor = Phaser.Display.Color.GetColor(
      Math.max(0, dark.red - 60), Math.max(0, dark.green - 60), Math.max(0, dark.blue - 60)
    );

    // Left leg
    gfx.fillStyle(darkColor, 1);
    gfx.fillRoundedRect(cx - 7, y + 24 + legSwing, 5, 12, 2);
    // Right leg
    gfx.fillRoundedRect(cx + 2, y + 24 - legSwing, 5, 12, 2);

    // Body (torso)
    gfx.fillStyle(color, 1);
    gfx.fillRoundedRect(cx - 9, y + 10 - bodyBob, 18, 16, 3);

    // Left arm
    gfx.fillStyle(darkColor, 1);
    gfx.fillRoundedRect(cx - 13, y + 12 - bodyBob - armSwing * 0.3, 5, 12, 2);
    // Right arm
    gfx.fillRoundedRect(cx + 8, y + 12 - bodyBob + armSwing * 0.3, 5, 12, 2);

    // Head
    gfx.fillStyle(color, 1);
    gfx.fillCircle(cx, y + 6 - bodyBob, 8);

    // Eyes
    const eyeOffX = facingLeft ? -3 : 3;
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(cx + eyeOffX - 2, y + 5 - bodyBob, 2.5);
    gfx.fillCircle(cx + eyeOffX + 2, y + 5 - bodyBob, 2.5);
    gfx.fillStyle(0x111111, 1);
    gfx.fillCircle(cx + eyeOffX - 1.5, y + 5.5 - bodyBob, 1.2);
    gfx.fillCircle(cx + eyeOffX + 2.5, y + 5.5 - bodyBob, 1.2);
  }

  private removePlayer(sessionId: string) {
    const s = this.playerSprites.get(sessionId);
    if (s) {
      s.gfx.destroy(); s.label.destroy(); s.shadow.destroy();
      s.healthBarBg.destroy(); s.healthBarFill.destroy();
      this.playerSprites.delete(sessionId);
    }
  }

  // ========== ITEM RENDERING (recognizable icons) ==========

  private addItemSprite(id: string, item: any) {
    if (this.itemSprites.has(id)) return;

    const gfx = this.add.graphics().setDepth(5);
    this.drawItemIcon(gfx, item.x, item.y, item);

    const label = this.add.text(item.x, item.y - 22, item.name, {
      fontSize: "14px", color: this.rarityColor(item.rarity), fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(6);

    this.itemSprites.set(id, { gfx, label, bobPhase: Math.random() * Math.PI * 2, baseY: item.y });
  }

  private drawItemIcon(gfx: Phaser.GameObjects.Graphics, x: number, y: number, item: any) {
    gfx.clear();

    // Glow for rare/uncommon
    if (item.rarity === "rare") {
      gfx.fillStyle(0xffd700, 0.15);
      gfx.fillCircle(x, y, 18);
      gfx.lineStyle(1.5, 0xffd700, 0.5);
      gfx.strokeCircle(x, y, 18);
    } else if (item.rarity === "uncommon") {
      gfx.fillStyle(0x00ccff, 0.1);
      gfx.fillCircle(x, y, 16);
    }

    const defId = item.defId || "";

    if (defId.includes("sword") || defId.includes("blade") || defId.includes("edge") || defId.includes("fang") || defId.includes("saber") || defId.includes("dagger")) {
      this.drawSword(gfx, x, y, item.color);
    } else if (defId.includes("club") || defId.includes("mace")) {
      this.drawClub(gfx, x, y, item.color);
    } else if (defId.includes("bow") || defId.includes("crossbow")) {
      this.drawBow(gfx, x, y, item.color);
    } else if (defId.includes("staff")) {
      this.drawStaff(gfx, x, y, item.color);
    } else if (defId.includes("vest") || defId.includes("mail") || defId.includes("plate") || defId.includes("hide") || defId.includes("helm") || defId.includes("armor")) {
      this.drawArmor(gfx, x, y, item.color);
    } else if (defId.includes("shield") || defId.includes("ward")) {
      this.drawShield(gfx, x, y, item.color);
    } else if (defId.includes("cloak")) {
      this.drawCloak(gfx, x, y, item.color);
    } else if (defId.includes("potion") || defId.includes("flask") || defId.includes("antidote")) {
      this.drawPotion(gfx, x, y, item.color);
    } else if (defId.includes("scroll")) {
      this.drawScroll(gfx, x, y, item.color);
    } else if (defId.includes("torch")) {
      this.drawTorch(gfx, x, y, item.color);
    } else if (defId.includes("bomb")) {
      this.drawBomb(gfx, x, y, item.color);
    } else if (defId.includes("bandage")) {
      this.drawBandage(gfx, x, y, item.color);
    } else if (defId.includes("ore")) {
      this.drawOre(gfx, x, y, item.color);
    } else {
      // Fallback: glowing orb
      gfx.fillStyle(item.color, 0.8);
      gfx.fillCircle(x, y, 8);
    }
  }

  private drawSword(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Blade
    gfx.fillStyle(color, 1);
    gfx.fillPoints([
      new Phaser.Geom.Point(x, y - 14),
      new Phaser.Geom.Point(x + 3, y - 2),
      new Phaser.Geom.Point(x - 3, y - 2),
    ], true);
    // Crossguard
    gfx.fillStyle(0x886633, 1);
    gfx.fillRect(x - 6, y - 3, 12, 3);
    // Handle
    gfx.fillStyle(0x553311, 1);
    gfx.fillRect(x - 1.5, y, 3, 8);
    // Pommel
    gfx.fillStyle(0x886633, 1);
    gfx.fillCircle(x, y + 9, 2.5);
  }

  private drawClub(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Handle
    gfx.fillStyle(0x664422, 1);
    gfx.fillRect(x - 2, y - 2, 4, 14);
    // Head
    gfx.fillStyle(color, 1);
    gfx.fillCircle(x, y - 6, 7);
    // Spikes
    gfx.fillStyle(0xcccccc, 0.8);
    gfx.fillCircle(x - 5, y - 8, 2);
    gfx.fillCircle(x + 5, y - 8, 2);
    gfx.fillCircle(x, y - 12, 2);
  }

  private drawArmor(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Chest shape
    gfx.fillStyle(color, 1);
    gfx.fillPoints([
      new Phaser.Geom.Point(x - 8, y - 10),
      new Phaser.Geom.Point(x - 4, y - 13),
      new Phaser.Geom.Point(x + 4, y - 13),
      new Phaser.Geom.Point(x + 8, y - 10),
      new Phaser.Geom.Point(x + 10, y - 4),
      new Phaser.Geom.Point(x + 7, y + 10),
      new Phaser.Geom.Point(x, y + 12),
      new Phaser.Geom.Point(x - 7, y + 10),
      new Phaser.Geom.Point(x - 10, y - 4),
    ], true);
    // Detail line
    const dark = Phaser.Display.Color.IntegerToColor(color);
    const dc = Phaser.Display.Color.GetColor(Math.max(0, dark.red - 40), Math.max(0, dark.green - 40), Math.max(0, dark.blue - 40));
    gfx.lineStyle(1, dc, 0.6);
    gfx.strokePoints([
      new Phaser.Geom.Point(x, y - 13),
      new Phaser.Geom.Point(x, y + 12),
    ], false);
  }

  private drawPotion(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Bottle neck
    gfx.fillStyle(0xaabbcc, 0.8);
    gfx.fillRect(x - 2, y - 12, 4, 5);
    // Cork
    gfx.fillStyle(0x886644, 1);
    gfx.fillRect(x - 2.5, y - 14, 5, 3);
    // Body
    gfx.fillStyle(color, 0.85);
    gfx.fillRoundedRect(x - 6, y - 7, 12, 16, 3);
    // Liquid shine
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillEllipse(x - 2, y - 2, 4, 8);
  }

  private drawScroll(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Paper
    gfx.fillStyle(0xeeddbb, 0.9);
    gfx.fillRect(x - 6, y - 8, 12, 16);
    // Top roll
    gfx.fillStyle(color, 1);
    gfx.fillEllipse(x, y - 8, 14, 5);
    // Bottom roll
    gfx.fillEllipse(x, y + 8, 14, 5);
    // Text lines on paper
    gfx.lineStyle(1, 0x886644, 0.4);
    for (let ly = -4; ly <= 4; ly += 3) {
      gfx.strokeLineShape(new Phaser.Geom.Line(x - 4, y + ly, x + 4, y + ly));
    }
  }

  private drawBow(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Curved bow
    gfx.lineStyle(3, color, 1);
    gfx.beginPath();
    gfx.arc(x + 6, y, 12, -Math.PI * 0.7, Math.PI * 0.7, false);
    gfx.strokePath();
    // String
    gfx.lineStyle(1, 0xcccccc, 0.7);
    gfx.strokeLineShape(new Phaser.Geom.Line(x + 6 - 12 * Math.cos(Math.PI * 0.7), y - 12 * Math.sin(Math.PI * 0.7),
      x + 6 - 12 * Math.cos(Math.PI * 0.7), y + 12 * Math.sin(Math.PI * 0.7)));
    // Arrow
    gfx.fillStyle(0x886644, 1);
    gfx.fillRect(x - 8, y - 1, 14, 2);
    gfx.fillStyle(0x999999, 1);
    gfx.fillTriangle(x - 10, y - 3, x - 10, y + 3, x - 14, y);
  }

  private drawStaff(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Staff body
    gfx.fillStyle(0x664422, 1);
    gfx.fillRect(x - 1.5, y - 8, 3, 20);
    // Orb on top
    gfx.fillStyle(color, 1);
    gfx.fillCircle(x, y - 10, 5);
    // Glow
    gfx.fillStyle(color, 0.3);
    gfx.fillCircle(x, y - 10, 8);
  }

  private drawCloak(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    gfx.fillStyle(color, 1);
    gfx.fillPoints([
      new Phaser.Geom.Point(x - 3, y - 12),
      new Phaser.Geom.Point(x + 3, y - 12),
      new Phaser.Geom.Point(x + 10, y + 10),
      new Phaser.Geom.Point(x + 5, y + 12),
      new Phaser.Geom.Point(x, y + 8),
      new Phaser.Geom.Point(x - 5, y + 12),
      new Phaser.Geom.Point(x - 10, y + 10),
    ], true);
    // Clasp
    gfx.fillStyle(0xffcc00, 0.8);
    gfx.fillCircle(x, y - 10, 2.5);
  }

  private drawTorch(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Handle
    gfx.fillStyle(0x664422, 1);
    gfx.fillRect(x - 2, y - 2, 4, 14);
    // Flame
    gfx.fillStyle(color, 1);
    gfx.fillPoints([
      new Phaser.Geom.Point(x, y - 10),
      new Phaser.Geom.Point(x + 5, y - 2),
      new Phaser.Geom.Point(x - 5, y - 2),
    ], true);
    // Inner flame
    gfx.fillStyle(0xffff44, 0.8);
    gfx.fillPoints([
      new Phaser.Geom.Point(x, y - 7),
      new Phaser.Geom.Point(x + 2.5, y - 2),
      new Phaser.Geom.Point(x - 2.5, y - 2),
    ], true);
  }

  private drawBomb(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    gfx.fillStyle(color, 1);
    gfx.fillCircle(x, y + 2, 8);
    // Fuse
    gfx.lineStyle(2, 0x886644, 1);
    gfx.strokeLineShape(new Phaser.Geom.Line(x + 4, y - 5, x + 8, y - 10));
    // Spark
    gfx.fillStyle(0xff8800, 1);
    gfx.fillCircle(x + 8, y - 10, 2);
  }

  private drawBandage(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Cross shape
    gfx.fillStyle(color, 1);
    gfx.fillRect(x - 3, y - 10, 6, 20);
    gfx.fillRect(x - 10, y - 3, 20, 6);
    // Red cross detail
    gfx.fillStyle(0xff4444, 0.6);
    gfx.fillRect(x - 2, y - 6, 4, 12);
    gfx.fillRect(x - 6, y - 2, 12, 4);
  }

  private drawOre(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Crystal/ore shape
    gfx.fillStyle(color, 1);
    gfx.fillPoints([
      new Phaser.Geom.Point(x, y - 10),
      new Phaser.Geom.Point(x + 8, y - 3),
      new Phaser.Geom.Point(x + 5, y + 8),
      new Phaser.Geom.Point(x - 5, y + 8),
      new Phaser.Geom.Point(x - 8, y - 3),
    ], true);
    // Sparkle
    gfx.fillStyle(0xffffff, 0.5);
    gfx.fillCircle(x - 2, y - 3, 2);
  }

  private drawShield(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
    // Shield shape
    gfx.fillStyle(color, 1);
    gfx.fillPoints([
      new Phaser.Geom.Point(x, y - 12),
      new Phaser.Geom.Point(x + 10, y - 8),
      new Phaser.Geom.Point(x + 10, y + 2),
      new Phaser.Geom.Point(x, y + 12),
      new Phaser.Geom.Point(x - 10, y + 2),
      new Phaser.Geom.Point(x - 10, y - 8),
    ], true);
    // Emblem
    gfx.lineStyle(1.5, 0xffffff, 0.4);
    gfx.strokeCircle(x, y - 1, 4);
  }

  private removeItemSprite(id: string) {
    const s = this.itemSprites.get(id);
    if (s) { s.gfx.destroy(); s.label.destroy(); this.itemSprites.delete(id); }
  }

  private updateItemSprite(id: string, item: any) {
    const s = this.itemSprites.get(id);
    if (!s) return;
    this.drawItemIcon(s.gfx, item.x, item.y, item);
    s.label.setText(item.name).setColor(this.rarityColor(item.rarity));
  }

  private rarityColor(rarity: string): string {
    switch (rarity) {
      case "rare": return "#ffd700";
      case "uncommon": return "#00ccff";
      default: return "#cccccc";
    }
  }

  // ========== DISASTER RENDERING ==========

  private addDisasterSprite(id: string, disaster: any) {
    const gfx = this.add.graphics().setDepth(4);
    const particles = this.add.graphics().setDepth(4);
    const dtype = disaster.disasterType || "blizzard";

    // Type-specific colors
    const colors: Record<string, { fill: number; stroke: number; text: string; label: string }> = {
      blizzard:  { fill: 0x0066cc, stroke: 0x00ccff, text: "#00ccff", label: "BLIZZARD INCOMING!" },
      meteor:    { fill: 0x663300, stroke: 0xff6600, text: "#ff6600", label: "METEOR STORM!" },
      lightning: { fill: 0x444400, stroke: 0xffff00, text: "#ffff00", label: "LIGHTNING STORM!" },
      ice:       { fill: 0x003366, stroke: 0x88ddff, text: "#88ddff", label: "ICE EVENT!" },
    };
    const c = colors[dtype] || colors.blizzard;

    // Warning circle
    gfx.fillStyle(c.fill, 0.08);
    gfx.fillCircle(disaster.x, disaster.y, disaster.radius);
    gfx.lineStyle(4, c.stroke, 0.9);
    gfx.strokeCircle(disaster.x, disaster.y, disaster.radius);

    const label = this.add.text(disaster.x, disaster.y - disaster.radius - 15, c.label, {
      fontSize: "18px", color: c.text, fontStyle: "bold",
      stroke: "#000022", strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(5);

    // Flash notification
    const flash = this.add.text(this.scale.width / 2, this.scale.height / 2 - 50, c.label, {
      fontSize: "32px", color: c.text, fontStyle: "bold",
      stroke: "#000033", strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(150);
    this.tweens.add({ targets: flash, alpha: 0, y: flash.y - 40, duration: 3000, onComplete: () => flash.destroy() });

    // Initialize particles (snowflakes for blizzard/ice, sparks for others)
    const snowflakes: any[] = [];
    const particleCount = dtype === "blizzard" || dtype === "ice" ? 40 : 20;
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * disaster.radius;
      snowflakes.push({
        x: disaster.x + Math.cos(angle) * dist,
        y: disaster.y + Math.sin(angle) * dist,
        vx: dtype === "lightning" ? (Math.random() - 0.5) * 3 : -0.5 + Math.random() * -1.5,
        vy: dtype === "meteor" ? -1 + Math.random() * 2 : 0.3 + Math.random() * 0.8,
        size: 1.5 + Math.random() * 2.5,
      });
    }

    this.disasterSprites.set(id, {
      gfx, label, phase: disaster.phase, disasterType: dtype,
      pulseTimer: 0, particles, snowflakes,
      cx: disaster.x, cy: disaster.y, radius: disaster.radius,
      lastStrikeSeq: disaster.strikeSeq ?? 0,
    });
  }

  private updateDisasterPhase(id: string, disaster: any) {
    const s = this.disasterSprites.get(id);
    if (!s) return;

    if (disaster.phase === "active") {
      s.gfx.clear();
      const fills: Record<string, { bg: number; line: number; labelColor: string; labelText: string }> = {
        blizzard:  { bg: 0x002266, line: 0x0088ff, labelColor: "#4499ff", labelText: "BLIZZARD" },
        meteor:    { bg: 0x331100, line: 0xff4400, labelColor: "#ff6600", labelText: "METEOR STORM" },
        lightning: { bg: 0x222200, line: 0xffff00, labelColor: "#ffff00", labelText: "LIGHTNING" },
        ice:       { bg: 0x002233, line: 0x66ccff, labelColor: "#88ddff", labelText: "ICE ZONE" },
      };
      const f = fills[s.disasterType] || fills.blizzard;
      s.gfx.fillStyle(f.bg, 0.3);
      s.gfx.fillCircle(disaster.x, disaster.y, disaster.radius);
      s.gfx.lineStyle(3, f.line, 0.7);
      s.gfx.strokeCircle(disaster.x, disaster.y, disaster.radius);
      s.label.setText(f.labelText).setColor(f.labelColor);
    }
  }

  private removeDisasterSprite(id: string) {
    const s = this.disasterSprites.get(id);
    if (s) {
      s.gfx.destroy(); s.label.destroy(); s.particles.destroy();
      this.disasterSprites.delete(id);
    }
  }

  private spawnStrikeVFX(x: number, y: number, type: string) {
    if (type === "meteor") {
      // Orange expanding circle + screen shake
      const gfx = this.add.graphics().setDepth(50);
      gfx.fillStyle(0xff6600, 0.6);
      gfx.fillCircle(x, y, 10);
      this.tweens.add({
        targets: { r: 10 }, r: 150, duration: 400, ease: "Power2",
        onUpdate: (_tw: any, target: any) => {
          gfx.clear();
          gfx.fillStyle(0xff6600, 0.4 * (1 - target.r / 150));
          gfx.fillCircle(x, y, target.r);
        },
        onComplete: () => gfx.destroy(),
      });
      this.cameras.main.shake(300, 0.015);
    } else if (type === "lightning") {
      // Bright yellow vertical line flash
      const gfx = this.add.graphics().setDepth(50);
      gfx.lineStyle(4, 0xffff00, 1);
      // Zigzag bolt
      const segments = 6;
      const startY = y - 200;
      let px = x, py = startY;
      gfx.beginPath();
      gfx.moveTo(px, py);
      for (let i = 1; i <= segments; i++) {
        px = x + (Math.random() - 0.5) * 40;
        py = startY + (y - startY) * (i / segments);
        gfx.lineTo(px, py);
      }
      gfx.strokePath();
      // Bright flash circle at strike point
      gfx.fillStyle(0xffffaa, 0.5);
      gfx.fillCircle(x, y, 30);
      this.tweens.add({ targets: gfx, alpha: 0, duration: 200, onComplete: () => gfx.destroy() });
    }
  }

  private spawnRarePickupVFX() {
    const w = this.scale.width;
    const h = this.scale.height;
    // Gold flash overlay
    const flash = this.add.rectangle(w / 2, h / 2, w, h, 0xffd700, 0)
      .setScrollFactor(0).setDepth(180);
    this.tweens.add({
      targets: flash, alpha: 0.2, yoyo: true, duration: 200, repeat: 1,
      onComplete: () => flash.destroy(),
    });
    // "RARE!" floating text
    const text = this.add.text(w / 2, h / 2 - 60, "★ RARE ITEM ★", {
      fontSize: "36px", color: "#ffd700", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(181);
    this.tweens.add({
      targets: text, alpha: 0, y: text.y - 60, scaleX: 1.3, scaleY: 1.3,
      duration: 1500, ease: "Power2",
      onComplete: () => text.destroy(),
    });
    // Particles (gold sparkles)
    const sparkles = this.add.graphics().setScrollFactor(0).setDepth(180);
    const particles: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: w / 2 + (Math.random() - 0.5) * 200,
        y: h / 2 + (Math.random() - 0.5) * 100,
        vx: (Math.random() - 0.5) * 4,
        vy: -1 - Math.random() * 3,
        life: 1,
      });
    }
    const timer = this.time.addEvent({
      delay: 16, repeat: 60,
      callback: () => {
        sparkles.clear();
        for (const p of particles) {
          p.x += p.vx; p.y += p.vy; p.life -= 0.016;
          if (p.life > 0) {
            sparkles.fillStyle(0xffd700, p.life);
            sparkles.fillCircle(p.x, p.y, 3);
          }
        }
      },
    });
    this.time.delayedCall(1100, () => { sparkles.destroy(); timer.destroy(); });
    this.playSfx("extract"); // celebratory sound
  }

  private spawnAttackVFX(x: number, y: number) {
    const gfx = this.add.graphics().setDepth(50);
    gfx.lineStyle(3, 0xffffff, 0.8);
    gfx.beginPath();
    gfx.arc(x, y, 30, -Math.PI * 0.3, Math.PI * 0.3, false);
    gfx.strokePath();
    this.tweens.add({
      targets: gfx, alpha: 0, duration: 200,
      onComplete: () => gfx.destroy(),
    });
  }

  // ========== EXTRACTION ZONE ==========

  private drawExtractionZone(x: number, y: number, radius: number) {
    const gfx = this.add.graphics().setDepth(3);
    // Pulsing green
    gfx.fillStyle(0x00ff66, 0.06);
    gfx.fillCircle(x, y, radius);
    gfx.lineStyle(3, 0x00ff66, 0.6);
    gfx.strokeCircle(x, y, radius);
    // Inner dashed feel
    gfx.lineStyle(1, 0x00ff66, 0.3);
    gfx.strokeCircle(x, y, radius - 8);

    // Arrow pointing down
    const arrowY = y - 20;
    gfx.fillStyle(0x00ff66, 0.8);
    gfx.fillTriangle(x - 8, arrowY - 8, x + 8, arrowY - 8, x, arrowY + 4);

    this.add.text(x, y - radius - 14, "EXTRACTION", {
      fontSize: "14px", color: "#00ff66", fontStyle: "bold",
      stroke: "#001100", strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(4);
  }

  // ========== HUD ==========

  private updateHUDSlot(slotIndex: number, itemId: string) {
    const text = this.hudSlots[slotIndex];
    if (!text || !text.scene) return;

    if (!itemId) {
      text.setText("Empty").setColor("#555555");
      this.hudSlotBgs[slotIndex]?.setStrokeStyle(1, 0x333355);
      this.hudSlotIcons[slotIndex]?.clear();
      return;
    }

    const item = (this.room.state as any).items?.get(itemId);
    if (item) {
      text.setText(item.name).setColor(this.rarityColor(item.rarity));
      const rarColor = item.rarity === "rare" ? 0xffd700 : item.rarity === "uncommon" ? 0x00ccff : 0x444466;
      this.hudSlotBgs[slotIndex]?.setStrokeStyle(1.5, rarColor);

      // Rare item pickup celebration (#13)
      if (item.rarity === "rare") {
        this.spawnRarePickupVFX();
      }

      // Mini icon in HUD
      const icon = this.hudSlotIcons[slotIndex];
      if (icon) {
        const w = this.scale.width;
        const slotWidth = 180;
        const startX = w / 2 - (slotWidth * 1.5 + 10);
        const sx = startX + slotIndex * (slotWidth + 10) + 16;
        const sy = this.scale.height - 46;
        icon.clear();
        icon.setScale(0.8);
        this.drawItemIcon(icon, sx / 0.8, sy / 0.8, item);
      }
    }
  }

  // ========== RESULTS ==========

  private showResults(results: any[]) {
    if (this.resultsShown) return;
    this.resultsShown = true;

    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.8)
      .setScrollFactor(0).setDepth(200);
    this.add.text(w / 2, 70, "SESSION COMPLETE", {
      fontSize: "36px", color: "#ffd700", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    let yPos = 130;
    for (const result of results) {
      const isLocal = result.sessionId === this.localSessionId;
      const prefix = isLocal ? ">> YOU <<" : result.sessionId.slice(0, 6);
      const itemNames = result.items.length > 0
        ? result.items.map((i: any) => `${i.name} (${i.rarity})`).join(", ")
        : "No items";
      this.add.text(w / 2, yPos, `${prefix}: ${itemNames}`, {
        fontSize: "16px", color: isLocal ? "#ffff00" : "#ffffff",
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
      yPos += 35;
    }
  }

  // ========== ENEMY RENDERING ==========

  private addEnemySprite(id: string, enemy: any) {
    const gfx = this.add.graphics().setDepth(9);
    const healthBarBg = this.add.rectangle(enemy.x - 14, enemy.y - 26, 28, 4, 0x333333, 0.8)
      .setOrigin(0, 0.5).setDepth(12);
    const healthBarFill = this.add.rectangle(enemy.x - 14, enemy.y - 26, 28, 4, 0xff6600, 1)
      .setOrigin(0, 0.5).setDepth(12);

    const sprite: EnemySprite = {
      gfx, healthBarBg, healthBarFill,
      targetX: enemy.x, targetY: enemy.y,
      prevX: enemy.x, prevY: enemy.y,
      enemyType: enemy.enemyType,
      aiState: enemy.aiState ?? "wander",
      facing: enemy.facing ?? 0,
      isDead: enemy.isDead ?? false,
      hp: enemy.hp ?? 50,
      maxHp: enemy.maxHp ?? 50,
    };
    this.enemySprites.set(id, sprite);
  }

  private drawEnemy(gfx: Phaser.GameObjects.Graphics, x: number, y: number, type: string, facing: number, aiState: string, isDead: boolean) {
    gfx.clear();
    if (isDead) {
      gfx.fillStyle(0x444444, 0.3);
      gfx.fillCircle(x, y, 8);
      return;
    }

    const isAggro = aiState === "chase" || aiState === "attack";

    if (type === "stalker") {
      // Dark triangle pointing in facing direction
      const color = isAggro ? 0xaa2200 : 0x333333;
      gfx.fillStyle(color, 1);
      const size = 18;
      const tipX = x + Math.cos(facing) * size;
      const tipY = y + Math.sin(facing) * size;
      const leftX = x + Math.cos(facing + 2.5) * size * 0.7;
      const leftY = y + Math.sin(facing + 2.5) * size * 0.7;
      const rightX = x + Math.cos(facing - 2.5) * size * 0.7;
      const rightY = y + Math.sin(facing - 2.5) * size * 0.7;
      gfx.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);

      // Eyes (red dots when aggro)
      if (isAggro) {
        gfx.fillStyle(0xff0000, 1);
        gfx.fillCircle(x + Math.cos(facing) * 5 - 3, y + Math.sin(facing) * 5, 2);
        gfx.fillCircle(x + Math.cos(facing) * 5 + 3, y + Math.sin(facing) * 5, 2);
      }
    } else {
      // Guardian: large octagon
      const color = isAggro ? 0xcc4400 : 0x554400;
      gfx.fillStyle(color, 1);
      const r = 22;
      const points: Phaser.Geom.Point[] = [];
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i - Math.PI / 8;
        points.push(new Phaser.Geom.Point(x + Math.cos(angle) * r, y + Math.sin(angle) * r));
      }
      gfx.fillPoints(points, true);
      // Inner detail
      gfx.lineStyle(2, 0xffaa00, 0.5);
      const ir = 10;
      const ipoints: Phaser.Geom.Point[] = [];
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i - Math.PI / 8;
        ipoints.push(new Phaser.Geom.Point(x + Math.cos(angle) * ir, y + Math.sin(angle) * ir));
      }
      gfx.strokePoints(ipoints, true);
    }
  }

  private removeEnemySprite(id: string) {
    const s = this.enemySprites.get(id);
    if (s) {
      s.gfx.destroy(); s.healthBarBg.destroy(); s.healthBarFill.destroy();
      this.enemySprites.delete(id);
    }
  }

  // ========== DAMAGE / DEATH ==========

  private spawnFloatingText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      fontSize: "18px", color, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({
      targets: t, y: y - 40, alpha: 0, duration: 1200,
      ease: "Power2",
      onComplete: () => t.destroy(),
    });
  }

  private showDeathOverlay() {
    if (this.deathOverlayText) return;
    const w = this.scale.width;
    const h = this.scale.height;
    this.deathOverlayText = this.add.text(w / 2, h / 2 - 40, "DEAD — Respawning...", {
      fontSize: "28px", color: "#ff4444", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(150);
  }

  private hideDeathOverlay() {
    if (this.deathOverlayText) {
      this.deathOverlayText.destroy();
      this.deathOverlayText = null;
    }
  }

  // ========== AUDIO ==========

  private initAudio() {
    if (this.audioCtx) return;
    try {
      this.audioCtx = new AudioContext();
    } catch { /* no audio support */ }
  }

  private playSfx(type: "pickup" | "hit" | "attack" | "extract" | "death") {
    if (!this.audioCtx) this.initAudio();
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case "pickup":
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(900, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
        break;
      case "hit":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.2);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case "attack":
        osc.type = "square";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(150, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.12);
        osc.start(now); osc.stop(now + 0.12);
        break;
      case "extract":
        osc.type = "sine";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.15);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.3);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
        break;
      case "death":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.5);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
        break;
    }
  }

  // ========== ARENA ==========

  private drawArena(width: number, height: number) {
    this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a1a).setDepth(0);

    const graphics = this.add.graphics().setDepth(1);
    graphics.lineStyle(1, 0x1a1a2e, 0.5);
    for (let x = 0; x <= width; x += GRID_SIZE) {
      graphics.moveTo(x, 0); graphics.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += GRID_SIZE) {
      graphics.moveTo(0, y); graphics.lineTo(width, y);
    }
    graphics.strokePath();

    // Zone visualization
    const zones = this.add.graphics().setDepth(1);

    // Danger zone (center)
    zones.fillStyle(0xff2200, 0.04);
    zones.fillCircle(width / 2, height / 2, 400);
    zones.lineStyle(1, 0xff4400, 0.15);
    zones.strokeCircle(width / 2, height / 2, 400);

    // Safe zones (corners)
    const corners = [
      { x: 0, y: 0 }, { x: width - 300, y: 0 },
      { x: 0, y: height - 300 }, { x: width - 300, y: height - 300 },
    ];
    for (const c of corners) {
      zones.fillStyle(0x00ff44, 0.03);
      zones.fillRect(c.x, c.y, 300, 300);
      zones.lineStyle(1, 0x00ff44, 0.1);
      zones.strokeRect(c.x, c.y, 300, 300);
    }

    // Subtle zone labels
    this.add.text(width / 2, height / 2 + 380, "DANGER ZONE", {
      fontSize: "12px", color: "#ff4400",
    }).setOrigin(0.5).setDepth(2).setAlpha(0.2);

    for (const c of corners) {
      this.add.text(c.x + 150, c.y + 280, "SAFE", {
        fontSize: "10px", color: "#00ff44",
      }).setOrigin(0.5).setDepth(2).setAlpha(0.15);
    }

    const border = this.add.graphics().setDepth(2);
    border.lineStyle(3, 0x9b59b6, 1);
    border.strokeRect(0, 0, width, height);
  }

  // ========== UPDATE LOOP ==========

  update(_time: number, delta: number) {
    if (!this.room) return;

    // Input
    const dx =
      (this.cursors.left.isDown || this.wasd.A.isDown ? -1 : 0) +
      (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0);
    const dy =
      (this.cursors.up.isDown || this.wasd.W.isDown ? -1 : 0) +
      (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0);

    if (dx !== this.lastDirection.dx || dy !== this.lastDirection.dy) {
      this.lastDirection = { dx, dy };
      this.room.send("move", { dx, dy });
    }

    if (Phaser.Input.Keyboard.JustDown(this.pickupKey)) {
      this.initAudio();
      this.room.send("pickup");
      this.playSfx("pickup");
    }
    if (Phaser.Input.Keyboard.JustDown(this.extractKey)) {
      this.initAudio();
      this.room.send("extract");
      this.playSfx("extract");
    }
    if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
      this.initAudio();
      this.room.send("attack");
      this.playSfx("attack");
    }
    if (Phaser.Input.Keyboard.JustDown(this.useKey)) {
      this.initAudio();
      this.room.send("use_utility");
      this.playSfx("pickup");
    }

    // Animate players
    this.playerSprites.forEach((s) => {
      const oldX = s.gfx.x || 0;
      const oldY = s.gfx.y || 0;
      // Lerp position (gfx is at 0,0, we draw at targetX/targetY)
      s.prevX += (s.targetX - s.prevX) * LERP_FACTOR;
      s.prevY += (s.targetY - s.prevY) * LERP_FACTOR;

      // Detect movement
      const moveX = s.targetX - s.prevX;
      const moveY = s.targetY - s.prevY;
      const moving = Math.abs(moveX) > 0.5 || Math.abs(moveY) > 0.5;

      if (moving) {
        s.walkPhase += delta * 0.012;
        s.isMoving = true;
        if (Math.abs(moveX) > 0.1) s.facingLeft = moveX < 0;
      } else {
        s.walkPhase *= 0.9; // Slow down to stop
        s.isMoving = false;
      }

      // Redraw character at interpolated position
      this.drawCharacter(s.gfx, s.prevX, s.prevY, s.color, s.walkPhase, s.facingLeft, s.isDead, s.graceTimer);

      // Update shadow & label & health bar positions
      s.shadow.setPosition(s.prevX + 16, s.prevY + 38);
      s.shadow.setVisible(!s.isDead);
      s.label.setPosition(s.prevX + 16, s.prevY - 18);

      // Health bar
      const hbX = s.prevX + 16 - 14;
      const hbY = s.prevY - 14;
      s.healthBarBg.setPosition(hbX, hbY).setVisible(!s.isDead);
      const hpRatio = s.maxHp > 0 ? Math.max(0, s.hp / s.maxHp) : 1;
      s.healthBarFill.setPosition(hbX, hbY).setDisplaySize(28 * hpRatio, 4).setVisible(!s.isDead);
      // Color: green > yellow > red based on HP ratio
      if (hpRatio > 0.6) s.healthBarFill.setFillStyle(0x33ff33, 1);
      else if (hpRatio > 0.3) s.healthBarFill.setFillStyle(0xffcc00, 1);
      else s.healthBarFill.setFillStyle(0xff3333, 1);
    });

    // Camera follow local player
    const localSprite = this.playerSprites.get(this.localSessionId);
    if (localSprite) {
      const cam = this.cameras.main;
      cam.scrollX += (localSprite.prevX + 16 - cam.midPoint.x) * 0.1;
      cam.scrollY += (localSprite.prevY + 16 - cam.midPoint.y) * 0.1;
    }

    // Item bobbing
    this.itemSprites.forEach((s) => {
      s.bobPhase += delta * 0.003;
      const bobY = Math.sin(s.bobPhase) * 2.5;
      s.gfx.setY(bobY);
      s.label.setY(s.baseY - 20 + bobY);
    });

    // Enemy animation
    this.enemySprites.forEach((s) => {
      s.prevX += (s.targetX - s.prevX) * LERP_FACTOR;
      s.prevY += (s.targetY - s.prevY) * LERP_FACTOR;
      this.drawEnemy(s.gfx, s.prevX, s.prevY, s.enemyType, s.facing, s.aiState, s.isDead);

      // Health bar
      const hbX = s.prevX - 14;
      const hbY = s.prevY - 26;
      s.healthBarBg.setPosition(hbX, hbY).setVisible(!s.isDead);
      const hpRatio = s.maxHp > 0 ? Math.max(0, s.hp / s.maxHp) : 1;
      s.healthBarFill.setPosition(hbX, hbY).setDisplaySize(28 * hpRatio, 4).setVisible(!s.isDead);
    });

    // Disaster particle animation
    this.disasterSprites.forEach((s) => {
      if (s.phase === "warning") {
        s.pulseTimer += delta * 0.003;
        s.gfx.setAlpha(0.5 + Math.sin(s.pulseTimer * 3) * 0.3);
      }

      // Animate particles
      s.particles.clear();
      const particleColors: Record<string, number> = {
        blizzard: 0xffffff, meteor: 0xff6600, lightning: 0xffff44, ice: 0xaaddff,
      };
      const pColor = particleColors[s.disasterType] ?? 0xffffff;
      s.particles.fillStyle(pColor, s.phase === "active" ? 0.7 : 0.3);

      for (const flake of s.snowflakes) {
        flake.x += flake.vx;
        flake.y += flake.vy;

        // Wrap around within disaster zone
        const dx = flake.x - s.cx;
        const dy = flake.y - s.cy;
        if (Math.sqrt(dx * dx + dy * dy) > s.radius) {
          const angle = Math.random() * Math.PI * 2;
          flake.x = s.cx + Math.cos(angle) * s.radius * 0.5;
          flake.y = s.cy - s.radius * 0.5 + Math.random() * s.radius * 0.3;
        }

        s.particles.fillCircle(flake.x, flake.y, flake.size);
      }

      // Lightning: random brief flicker for the whole zone during active
      if (s.disasterType === "lightning" && s.phase === "active") {
        if (Math.random() < 0.02) {
          s.gfx.setAlpha(0.8);
          this.time.delayedCall(80, () => s.gfx.setAlpha(1));
        }
      }
    });

    this.updateMinimap();
    this.updateProximityHints();
    this.checkDangerZone();
  }

  private updateMinimap() {
    if (!this.minimapGfx || !this.room?.state) return;
    this.minimapGfx.clear();

    const mmSize = 140;
    const mmX = 12;
    const mmY = 12;
    const state = this.room.state as any;
    const mapW = state.mapWidth || 1600;
    const mapH = state.mapHeight || 1200;
    const scaleX = mmSize / mapW;
    const scaleY = mmSize / mapH;

    // Danger zone (center circle)
    this.minimapGfx.fillStyle(0xff2200, 0.15);
    this.minimapGfx.fillCircle(mmX + mapW / 2 * scaleX, mmY + mapH / 2 * scaleY, 400 * scaleX);

    // Extraction zone
    this.minimapGfx.fillStyle(0x00ff66, 0.3);
    this.minimapGfx.fillCircle(
      mmX + state.extractX * scaleX,
      mmY + state.extractY * scaleY,
      Math.max(3, state.extractRadius * scaleX)
    );

    // Items on ground (small dots)
    state.items?.forEach((item: any) => {
      if (!item.onGround) return;
      const rarityColor = item.rarity === "rare" ? 0xffd700 : item.rarity === "uncommon" ? 0x00ccff : 0x666666;
      this.minimapGfx.fillStyle(rarityColor, 0.6);
      this.minimapGfx.fillCircle(mmX + item.x * scaleX, mmY + item.y * scaleY, 1.5);
    });

    // Enemies (red dots)
    state.enemies?.forEach((enemy: any) => {
      if (enemy.isDead) return;
      this.minimapGfx.fillStyle(0xff4400, 0.8);
      this.minimapGfx.fillCircle(mmX + enemy.x * scaleX, mmY + enemy.y * scaleY, 2);
    });

    // Disasters (colored circles)
    state.disasters?.forEach((disaster: any) => {
      const dColors: Record<string, number> = {
        blizzard: 0x0088ff, meteor: 0xff6600, lightning: 0xffff00, ice: 0x88ddff,
      };
      const c = dColors[disaster.disasterType] || 0x0088ff;
      this.minimapGfx.lineStyle(1, c, 0.5);
      this.minimapGfx.strokeCircle(
        mmX + disaster.x * scaleX,
        mmY + disaster.y * scaleY,
        disaster.radius * scaleX
      );
    });

    // Other players (colored dots)
    state.players?.forEach((player: any, sid: unknown) => {
      const isLocal = (sid as string) === this.localSessionId;
      if (player.isDead) return;
      this.minimapGfx.fillStyle(player.color, 1);
      const dotSize = isLocal ? 4 : 3;
      this.minimapGfx.fillCircle(mmX + player.x * scaleX, mmY + player.y * scaleY, dotSize);
      if (isLocal) {
        this.minimapGfx.lineStyle(1, 0xffffff, 0.6);
        this.minimapGfx.strokeCircle(mmX + player.x * scaleX, mmY + player.y * scaleY, 5);
      }
    });
  }

  private checkDangerZone() {
    const local = this.playerSprites.get(this.localSessionId);
    if (!local || !this.room?.state) return;
    const state = this.room.state as any;
    const px = local.prevX + 16;
    const py = local.prevY + 16;
    const cx = (state.mapWidth || 1600) / 2;
    const cy = (state.mapHeight || 1200) / 2;
    const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
    const inDanger = dist < 400;

    if (inDanger && !this.wasInDangerZone) {
      const warn = this.add.text(this.scale.width / 2, this.scale.height / 2 - 100,
        "⚠ ENTERING DANGER ZONE ⚠", {
          fontSize: "24px", color: "#ff4400", fontStyle: "bold",
          stroke: "#000000", strokeThickness: 4,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(150);
      this.tweens.add({
        targets: warn, alpha: 0, y: warn.y - 40,
        duration: 2500, onComplete: () => warn.destroy(),
      });
      this.playSfx("hit");
    }
    this.wasInDangerZone = inDanger;
  }

  private updateProximityHints() {
    const local = this.playerSprites.get(this.localSessionId);
    if (!local) {
      this.pickupHint.setVisible(false);
      this.extractHint.setVisible(false);
      return;
    }

    const px = local.prevX + 16;
    const py = local.prevY + 16;

    let nearItem = false;
    if (this.room?.state) {
      (this.room.state as any).items?.forEach((item: any) => {
        if (!item.onGround) return;
        const d = Math.sqrt((px - item.x) ** 2 + (py - item.y) ** 2);
        if (d < PICKUP_RADIUS) nearItem = true;
      });
    }
    this.pickupHint.setVisible(nearItem);

    if (this.room?.state) {
      const state = this.room.state as any;
      const d = Math.sqrt((px - state.extractX) ** 2 + (py - state.extractY) ** 2);
      this.extractHint.setVisible(d < state.extractRadius + 20);
    }
  }
}
