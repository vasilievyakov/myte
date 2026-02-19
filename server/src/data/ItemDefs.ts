export interface ItemDef {
  defId: string;
  name: string;
  type: "weapon" | "armor" | "utility";
  rarity: "common" | "uncommon" | "rare";
  color: number;
}

export const ITEM_DEFS: Record<string, ItemDef> = {
  // ========== BASE WEAPONS (9) ==========
  iron_sword:    { defId: "iron_sword",    name: "Iron Sword",    type: "weapon",  rarity: "common",   color: 0xaaaaaa },
  fire_blade:    { defId: "fire_blade",    name: "Fire Blade",    type: "weapon",  rarity: "uncommon", color: 0xff6b35 },
  frost_edge:    { defId: "frost_edge",    name: "Frost Edge",    type: "weapon",  rarity: "rare",     color: 0x00d4ff },
  bone_club:     { defId: "bone_club",     name: "Bone Club",     type: "weapon",  rarity: "common",   color: 0xe8d5b7 },
  rusty_bow:     { defId: "rusty_bow",     name: "Rusty Bow",     type: "weapon",  rarity: "common",   color: 0x997744 },
  staff:         { defId: "staff",         name: "Magic Staff",   type: "weapon",  rarity: "uncommon", color: 0xaa44ff },
  dagger:        { defId: "dagger",        name: "Dagger",        type: "weapon",  rarity: "common",   color: 0xbbbbbb },
  mace:          { defId: "mace",          name: "Iron Mace",     type: "weapon",  rarity: "common",   color: 0x888888 },
  crossbow:      { defId: "crossbow",      name: "Crossbow",      type: "weapon",  rarity: "uncommon", color: 0x886633 },

  // ========== BASE ARMOR (7) ==========
  leather_vest:  { defId: "leather_vest",  name: "Leather Vest",  type: "armor",   rarity: "common",   color: 0x8b6914 },
  chainmail:     { defId: "chainmail",     name: "Chainmail",     type: "armor",   rarity: "uncommon", color: 0xc0c0c0 },
  ice_plate:     { defId: "ice_plate",     name: "Ice Plate",     type: "armor",   rarity: "rare",     color: 0x88ccff },
  wooden_shield: { defId: "wooden_shield", name: "Wooden Shield", type: "armor",   rarity: "common",   color: 0x996633 },
  iron_helm:     { defId: "iron_helm",     name: "Iron Helm",     type: "armor",   rarity: "common",   color: 0x999999 },
  cloak:         { defId: "cloak",         name: "Shadow Cloak",  type: "armor",   rarity: "uncommon", color: 0x442266 },
  plate_armor:   { defId: "plate_armor",   name: "Plate Armor",   type: "armor",   rarity: "rare",     color: 0x778899 },

  // ========== BASE UTILITY (9) ==========
  health_potion: { defId: "health_potion", name: "Health Potion", type: "utility", rarity: "common",   color: 0xff4444 },
  speed_scroll:  { defId: "speed_scroll",  name: "Speed Scroll",  type: "utility", rarity: "common",   color: 0x44ff44 },
  frost_ward:    { defId: "frost_ward",    name: "Frost Ward",    type: "utility", rarity: "rare",     color: 0x44ddff },
  bandage:       { defId: "bandage",       name: "Bandage",       type: "utility", rarity: "common",   color: 0xeeeecc },
  smoke_bomb:    { defId: "smoke_bomb",    name: "Smoke Bomb",    type: "utility", rarity: "common",   color: 0x666688 },
  grapple_hook:  { defId: "grapple_hook",  name: "Grapple Hook",  type: "utility", rarity: "uncommon", color: 0x997755 },
  torch:         { defId: "torch",         name: "Torch",         type: "utility", rarity: "common",   color: 0xffaa00 },
  antidote:      { defId: "antidote",      name: "Antidote",      type: "utility", rarity: "common",   color: 0x44ff88 },
  compass:       { defId: "compass",       name: "Compass",       type: "utility", rarity: "uncommon", color: 0xdddddd },

  // ========== MUTATED: BLIZZARD ==========
  frozen_sword:    { defId: "frozen_sword",    name: "Frozen Sword",    type: "weapon",  rarity: "uncommon", color: 0x66bbff },
  blizzard_fang:   { defId: "blizzard_fang",   name: "Blizzard Fang",   type: "weapon",  rarity: "rare",     color: 0x00eeff },
  frozen_hide:     { defId: "frozen_hide",     name: "Frozen Hide",     type: "armor",   rarity: "uncommon", color: 0x5599cc },
  glacial_mail:    { defId: "glacial_mail",    name: "Glacial Mail",    type: "armor",   rarity: "rare",     color: 0x99ddff },
  cryo_flask:      { defId: "cryo_flask",      name: "Cryo Flask",      type: "utility", rarity: "uncommon", color: 0x66aaff },
  blizzard_scroll: { defId: "blizzard_scroll", name: "Blizzard Scroll", type: "utility", rarity: "uncommon", color: 0x88eeff },

  // ========== MUTATED: LIGHTNING ==========
  storm_blade:     { defId: "storm_blade",     name: "Storm Blade",     type: "weapon",  rarity: "rare",     color: 0xffff00 },
  thunder_mail:    { defId: "thunder_mail",    name: "Thunder Mail",    type: "armor",   rarity: "rare",     color: 0xffee00 },
  static_vest:     { defId: "static_vest",     name: "Static Vest",     type: "armor",   rarity: "uncommon", color: 0xcccc00 },
  spark_scroll:    { defId: "spark_scroll",    name: "Spark Scroll",    type: "utility", rarity: "uncommon", color: 0xeeee44 },
  volt_potion:     { defId: "volt_potion",     name: "Volt Potion",     type: "utility", rarity: "uncommon", color: 0xdddd00 },

  // ========== MUTATED: METEOR ==========
  molten_blade:    { defId: "molten_blade",    name: "Molten Blade",    type: "weapon",  rarity: "rare",     color: 0xff4400 },
  magma_club:      { defId: "magma_club",      name: "Magma Club",      type: "weapon",  rarity: "uncommon", color: 0xff6622 },
  magma_plate:     { defId: "magma_plate",     name: "Magma Plate",     type: "armor",   rarity: "rare",     color: 0xcc3300 },
  ember_flask:     { defId: "ember_flask",     name: "Ember Flask",     type: "utility", rarity: "uncommon", color: 0xff5500 },

  // ========== MUTATED: ICE ==========
  crystal_saber:   { defId: "crystal_saber",   name: "Crystal Saber",   type: "weapon",  rarity: "rare",     color: 0xccffff },
  ice_bow:         { defId: "ice_bow",         name: "Ice Bow",         type: "weapon",  rarity: "uncommon", color: 0x88ccee },
  ice_shield:      { defId: "ice_shield",      name: "Ice Shield",      type: "armor",   rarity: "uncommon", color: 0x99eeff },
  frost_cloak:     { defId: "frost_cloak",     name: "Frost Cloak",     type: "armor",   rarity: "rare",     color: 0x66bbee },

  // ========== SPECIAL ==========
  meteor_ore:      { defId: "meteor_ore",      name: "Meteor Ore",      type: "utility", rarity: "uncommon", color: 0xff6600 },
};

// base defId + disaster type => mutated defId
export const MUTATION_TABLE: Record<string, Record<string, string>> = {
  blizzard: {
    iron_sword:    "frozen_sword",
    fire_blade:    "frost_edge",
    bone_club:     "blizzard_fang",
    leather_vest:  "frozen_hide",
    chainmail:     "glacial_mail",
    health_potion: "cryo_flask",
    speed_scroll:  "blizzard_scroll",
  },
  lightning: {
    iron_sword:    "storm_blade",
    chainmail:     "thunder_mail",
    leather_vest:  "static_vest",
    speed_scroll:  "spark_scroll",
    health_potion: "volt_potion",
    mace:          "storm_blade",
  },
  meteor: {
    fire_blade:    "molten_blade",
    bone_club:     "magma_club",
    chainmail:     "magma_plate",
    health_potion: "ember_flask",
    torch:         "ember_flask",
  },
  ice: {
    iron_sword:    "crystal_saber",
    rusty_bow:     "ice_bow",
    wooden_shield: "ice_shield",
    cloak:         "frost_cloak",
    dagger:        "crystal_saber",
  },
};

// Zone-based spawn pools
export const SAFE_ZONE_POOL: string[] = [
  "bandage", "bandage", "bandage",
  "torch", "torch",
  "iron_sword", "iron_sword",
  "dagger", "dagger",
  "leather_vest", "leather_vest",
  "wooden_shield",
  "health_potion", "health_potion", "health_potion",
  "antidote", "antidote",
];

export const MEDIUM_ZONE_POOL: string[] = [
  "crossbow", "rusty_bow", "staff",
  "mace", "bone_club",
  "chainmail", "iron_helm", "cloak",
  "smoke_bomb", "grapple_hook", "compass",
  "speed_scroll", "health_potion",
  "bandage",
];

export const DANGER_ZONE_POOL: string[] = [
  "fire_blade", "frost_edge", "staff", "crossbow",
  "plate_armor", "chainmail", "ice_plate", "cloak",
  "frost_ward", "grapple_hook", "speed_scroll",
];

// Legacy pool (kept for compatibility)
export const SPAWN_POOL: string[] = [
  "iron_sword", "iron_sword", "iron_sword",
  "bone_club", "bone_club",
  "fire_blade",
  "leather_vest", "leather_vest", "leather_vest",
  "chainmail",
  "health_potion", "health_potion", "health_potion",
  "speed_scroll", "speed_scroll",
];
