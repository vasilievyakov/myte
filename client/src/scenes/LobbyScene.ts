import Phaser from "phaser";
import { Client, Room, Callbacks } from "@colyseus/sdk";

export class LobbyScene extends Phaser.Scene {
  private room!: Room;
  private readyBtn!: Phaser.GameObjects.Rectangle;
  private readyBtnText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private playerListTexts: Phaser.GameObjects.Text[] = [];
  private isReady = false;
  private transitioned = false;

  constructor() {
    super({ key: "LobbyScene" });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Background
    this.add.rectangle(w / 2, h / 2, w, h, 0x0a0a1a);

    // Title
    this.add.text(w / 2, 80, "MYTE", {
      fontSize: "64px", color: "#9b59b6", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(w / 2, 130, "Risk-Looter Arena", {
      fontSize: "18px", color: "#666688",
    }).setOrigin(0.5);

    // Status
    this.statusText = this.add.text(w / 2, 200, "Connecting...", {
      fontSize: "16px", color: "#888888",
    }).setOrigin(0.5);

    // Ready button
    this.readyBtn = this.add.rectangle(w / 2, h - 100, 200, 60, 0x2ecc71)
      .setInteractive({ useHandCursor: true });
    this.readyBtnText = this.add.text(w / 2, h - 100, "READY", {
      fontSize: "24px", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5);

    this.readyBtn.on("pointerdown", () => {
      if (!this.room || this.isReady) return;
      this.isReady = true;
      this.room.send("ready");
      this.readyBtn.setFillStyle(0x555555);
      this.readyBtnText.setText("WAITING...");
    });

    this.readyBtn.setVisible(false);
    this.readyBtnText.setVisible(false);

    // Instructions for new players (#26)
    const instructions = [
      "WASD / Arrows — Move",
      "E — Pick up items",
      "F — Attack enemies",
      "Q — Use utility item",
      "SHIFT — Sprint",
      "SPACE — Extract (in extraction zone)",
      "",
      "Goal: Collect loot, survive, extract!",
    ];
    instructions.forEach((line, i) => {
      this.add.text(w / 2, h - 260 + i * 18, line, {
        fontSize: "13px", color: line === "" ? "#000000" : (i < 6 ? "#555577" : "#888899"),
        fontFamily: "monospace",
      }).setOrigin(0.5);
    });

    this.connectToServer();
  }

  private async connectToServer() {
    try {
      const serverUrl = window.location.hostname === "localhost"
        ? "http://localhost:2567"
        : window.location.origin;
      const client = new Client(serverUrl);
      this.room = await client.joinOrCreate("game_room");
      this.statusText.setText(`Connected! Session: ${this.room.sessionId.slice(0, 6)}`);
      this.readyBtn.setVisible(true);
      this.readyBtnText.setVisible(true);

      const $ = Callbacks.get(this.room);

      $.onAdd("players", () => this.updatePlayerList());
      $.onRemove("players", () => this.updatePlayerList());

      $.onChange(this.room.state, () => {
        if (this.transitioned) return;
        const state = this.room.state as any;
        if (state.gamePhase === "countdown" || state.gamePhase === "playing" || state.gamePhase === "extractWarn") {
          this.transitioned = true;
          this.scene.start("GameScene", { room: this.room });
          return;
        }
        this.updatePlayerList();
      });

      this.updatePlayerList();
    } catch (e) {
      this.statusText.setText("Connection failed! Start the server first.").setColor("#ff4444");
    }
  }

  private lobbyDots: Phaser.GameObjects.Graphics[] = [];

  private updatePlayerList() {
    // Clear old texts and dots
    for (const t of this.playerListTexts) t.destroy();
    for (const d of this.lobbyDots) d.destroy();
    this.playerListTexts = [];
    this.lobbyDots = [];

    if (!this.room?.state) return;
    const state = this.room.state as any;
    const w = this.scale.width;
    let y = 250;

    const playerColors = [0x9b59b6, 0x1abc9c, 0xf1c40f, 0xe74c3c];
    const playerNames = ["Purple", "Teal", "Gold", "Red"];
    let idx = 0;

    state.players?.forEach((player: any, sid: string) => {
      const isLocal = sid === this.room.sessionId;
      const name = isLocal ? `Player ${idx + 1} (YOU)` : `Player ${idx + 1}`;
      const ready = player.isReady ? "✓ READY" : "waiting...";
      const color = playerColors[idx % playerColors.length];

      // Color circle
      const dot = this.add.graphics();
      dot.fillStyle(color, 1);
      dot.fillCircle(w / 2 - 120, y, 12);
      this.lobbyDots.push(dot);

      const t = this.add.text(w / 2 - 100, y, `${name}  ${ready}`, {
        fontSize: "20px",
        color: player.isReady ? "#2ecc71" : "#888888",
        fontStyle: isLocal ? "bold" : "normal",
      }).setOrigin(0, 0.5);
      this.playerListTexts.push(t);

      y += 50;
      idx++;
    });

    // Player count
    const countText = this.add.text(w / 2, 220, `${idx}/4 players`, {
      fontSize: "14px", color: "#555577",
    }).setOrigin(0.5);
    this.playerListTexts.push(countText);
  }
}
