export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1200;

export type ZoneName = "safe" | "medium" | "danger";

export const SAFE_ZONES = [
  { x: 0, y: 0, w: 300, h: 300 },
  { x: MAP_WIDTH - 300, y: 0, w: 300, h: 300 },
  { x: 0, y: MAP_HEIGHT - 300, w: 300, h: 300 },
  { x: MAP_WIDTH - 300, y: MAP_HEIGHT - 300, w: 300, h: 300 },
];

export const DANGER_ZONE = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, radius: 400 };

export function getZone(x: number, y: number): ZoneName {
  for (const sz of SAFE_ZONES) {
    if (x >= sz.x && x < sz.x + sz.w && y >= sz.y && y < sz.y + sz.h) return "safe";
  }
  const dx = x - DANGER_ZONE.x;
  const dy = y - DANGER_ZONE.y;
  if (Math.sqrt(dx * dx + dy * dy) < DANGER_ZONE.radius) return "danger";
  return "medium";
}

export function randomPositionInZone(zone: ZoneName): { x: number; y: number } {
  for (let attempt = 0; attempt < 20; attempt++) {
    let x: number, y: number;

    if (zone === "safe") {
      const corner = SAFE_ZONES[Math.floor(Math.random() * SAFE_ZONES.length)];
      x = corner.x + 20 + Math.random() * (corner.w - 40);
      y = corner.y + 20 + Math.random() * (corner.h - 40);
    } else if (zone === "danger") {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * DANGER_ZONE.radius * 0.8;
      x = DANGER_ZONE.x + Math.cos(angle) * dist;
      y = DANGER_ZONE.y + Math.sin(angle) * dist;
    } else {
      x = 50 + Math.random() * (MAP_WIDTH - 100);
      y = 50 + Math.random() * (MAP_HEIGHT - 100);
    }

    if (getZone(x, y) === zone) return { x, y };
  }

  // Fallback
  return { x: MAP_WIDTH / 2 + 500, y: MAP_HEIGHT / 2 };
}
