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
        if (state.gamePhase === "playing" || state.gamePhase === "extractWarn") {
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

  private updatePlayerList() {
    // Clear old texts
    for (const t of this.playerListTexts) t.destroy();
    this.playerListTexts = [];

    if (!this.room?.state) return;
    const state = this.room.state as any;
    const w = this.scale.width;
    let y = 250;

    const playerColors = [0x9b59b6, 0x1abc9c, 0xf1c40f, 0xe74c3c];
    let idx = 0;

    state.players?.forEach((player: any, sid: string) => {
      const isLocal = sid === this.room.sessionId;
      const name = isLocal ? "YOU" : sid.slice(0, 6);
      const ready = player.isReady ? "READY" : "...";
      const color = playerColors[idx % playerColors.length];

      // Color dot
      const dot = this.add.graphics();
      dot.fillStyle(color, 1);
      dot.fillCircle(w / 2 - 100, y, 8);
      // We can't easily store graphics in text array, so just let it exist

      const t = this.add.text(w / 2 - 80, y, `${name}  ${ready}`, {
        fontSize: "18px",
        color: player.isReady ? "#2ecc71" : "#888888",
        fontStyle: isLocal ? "bold" : "normal",
      }).setOrigin(0, 0.5);
      this.playerListTexts.push(t);

      y += 40;
      idx++;
    });
  }
}
