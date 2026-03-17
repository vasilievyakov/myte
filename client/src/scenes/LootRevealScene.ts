import Phaser from "phaser";

interface RevealResult {
  sessionId: string;
  color: number;
  items: { name: string; rarity: string; type: string }[];
  kills: number;
  score: number;
}

export class LootRevealScene extends Phaser.Scene {
  private results: RevealResult[] = [];
  private localSessionId = "";

  constructor() {
    super({ key: "LootRevealScene" });
  }

  init(data: { results: RevealResult[]; localSessionId: string }) {
    this.results = data.results || [];
    this.localSessionId = data.localSessionId || "";
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Dark background
    this.add.rectangle(w / 2, h / 2, w, h, 0x050510);

    // Title fade in
    const title = this.add.text(w / 2, 50, "SESSION COMPLETE", {
      fontSize: "36px", color: "#ffd700", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: title, alpha: 1, duration: 800 });

    // Reveal each player's results with staggered timing
    let baseDelay = 1000;
    const startY = 130;
    const rowHeight = 110;

    for (let i = 0; i < this.results.length; i++) {
      const result = this.results[i];
      const isLocal = result.sessionId === this.localSessionId;
      const y = startY + i * rowHeight;

      // Player color circle slides in from left
      const circle = this.add.graphics().setAlpha(0);
      circle.fillStyle(result.color, 1);
      circle.fillCircle(0, 0, 16);
      circle.setPosition(-50, y + 20);

      this.tweens.add({
        targets: circle,
        x: 60, alpha: 1,
        duration: 500, delay: baseDelay,
        ease: "Power2",
      });

      // Rank badge
      const rank = i + 1;
      const rankColors = ["#ffd700", "#c0c0c0", "#cd7f32", "#888888"];
      const rankText = this.add.text(90, y + 10, `#${rank}`, {
        fontSize: "16px", color: rankColors[i] || "#888888", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0, 0.5).setAlpha(0);

      this.tweens.add({ targets: rankText, alpha: 1, duration: 400, delay: baseDelay + 100 });

      // Player name + score
      const name = isLocal ? ">> YOU <<" : `Player ${i + 1}`;
      const nameText = this.add.text(120, y + 10, name, {
        fontSize: "20px",
        color: isLocal ? "#ffff00" : "#ffffff",
        fontStyle: "bold",
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0, 0.5).setAlpha(0);

      // Stats line
      const statsText = this.add.text(120, y + 32, `Score: ${result.score}  •  Kills: ${result.kills}`, {
        fontSize: "12px", color: "#888899",
      }).setAlpha(0);

      this.tweens.add({
        targets: [nameText, statsText],
        alpha: 1, duration: 400, delay: baseDelay + 200,
      });

      // Reveal items one by one
      if (result.items.length === 0) {
        const noItems = this.add.text(90, y + 50, "No items extracted", {
          fontSize: "14px", color: "#666666",
        }).setAlpha(0);
        this.tweens.add({
          targets: noItems,
          alpha: 1, duration: 400, delay: baseDelay + 600,
        });
      } else {
        for (let j = 0; j < result.items.length; j++) {
          const item = result.items[j];
          const itemDelay = baseDelay + 600 + j * 400;
          const itemX = 100 + j * 200;

          const rarityColors: Record<string, string> = {
            rare: "#ffd700", uncommon: "#00ccff", common: "#cccccc",
          };
          const rarityColor = rarityColors[item.rarity] || "#cccccc";

          // Item box
          const box = this.add.rectangle(itemX + 60, y + 50, 170, 36, 0x111122, 0.8)
            .setStrokeStyle(1, item.rarity === "rare" ? 0xffd700 : 0x333355)
            .setScale(0).setOrigin(0.5);

          const itemText = this.add.text(itemX + 60, y + 50,
            `${item.name}`, {
              fontSize: "13px", color: rarityColor, fontStyle: "bold",
            }).setOrigin(0.5).setAlpha(0);

          const typeLabel = this.add.text(itemX + 60, y + 66,
            `[${item.type}] ${item.rarity}`, {
              fontSize: "9px", color: "#666688",
            }).setOrigin(0.5).setAlpha(0);

          // Bounce tween
          this.tweens.add({
            targets: box,
            scaleX: 1, scaleY: 1,
            duration: 300, delay: itemDelay,
            ease: "Back.easeOut",
          });
          this.tweens.add({
            targets: [itemText, typeLabel],
            alpha: 1, duration: 200, delay: itemDelay + 150,
          });

          // Rare item glow flash
          if (item.rarity === "rare") {
            const glow = this.add.rectangle(itemX + 60, y + 50, 180, 46, 0xffd700, 0)
              .setOrigin(0.5);
            this.tweens.add({
              targets: glow,
              alpha: 0.3, yoyo: true, duration: 300, delay: itemDelay + 100,
              repeat: 2,
            });
          }
        }
      }

      baseDelay += 800 + result.items.length * 400;
    }

    // "PLAY AGAIN" button appears after all reveals
    const btnDelay = baseDelay + 500;
    const btn = this.add.rectangle(w / 2, h - 70, 200, 50, 0x9b59b6)
      .setInteractive({ useHandCursor: true }).setAlpha(0);
    const btnText = this.add.text(w / 2, h - 70, "PLAY AGAIN", {
      fontSize: "20px", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [btn, btnText], alpha: 1, duration: 500, delay: btnDelay });

    btn.on("pointerdown", () => {
      this.scene.start("LobbyScene");
    });
  }
}
