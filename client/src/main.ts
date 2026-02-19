import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { GameScene } from "./scenes/GameScene";
import { LootRevealScene } from "./scenes/LootRevealScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  width: 800,
  height: 600,
  backgroundColor: "#0a0a0f",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, LobbyScene, GameScene, LootRevealScene],
};

new Phaser.Game(config);
