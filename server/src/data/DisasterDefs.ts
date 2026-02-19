export interface DisasterDef {
  type: string;
  warningDuration: number;
  activeDuration: number;
  radius: number;
  subEventInterval?: number;
  subEventDamage?: number;
  subEventRadius?: number;
}

export const DISASTER_DEFS: Record<string, DisasterDef> = {
  blizzard: {
    type: "blizzard",
    warningDuration: 3,
    activeDuration: 15,
    radius: 300,
  },
  meteor: {
    type: "meteor",
    warningDuration: 3,
    activeDuration: 12,
    radius: 400,
    subEventInterval: 2,
    subEventDamage: 40,
    subEventRadius: 150,
  },
  lightning: {
    type: "lightning",
    warningDuration: 3,
    activeDuration: 10,
    radius: 350,
    subEventInterval: 1.5,
    subEventDamage: 20,
    subEventRadius: 80,
  },
  ice: {
    type: "ice",
    warningDuration: 3,
    activeDuration: 15,
    radius: 300,
  },
};

export const DISASTER_ROTATION = ["blizzard", "meteor", "lightning", "ice"];
