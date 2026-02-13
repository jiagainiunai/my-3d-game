// Procedural Map Generation Helpers
const MAP_SIZE = 800;

// Generate random obstacles with strict overlap checking
export const generateObstacles = (mapSize = 900, count = 300) => {
    const obs = [];
    
    // 1. Central "Fortress" area - Keep it somewhat clear but with a center peak
    obs.push({ x: 0, z: 0, r: 18, type: 'mountain' });
    
    let attempts = 0;
    // We try to fit 'count' obstacles, but stop if we can't find space
    while(obs.length < count && attempts < count * 10) {
        attempts++;
        
        const x = (Math.random() - 0.5) * mapSize;
        const z = (Math.random() - 0.5) * mapSize;
        // Large rocks: 6-14 radius
        const r = 6 + Math.random() * 8; 
        
        // Safety Zones: Don't spawn on Bases or the main horizontal lanes too much
        if (Math.abs(z) > mapSize * 0.42) continue; // Base areas
        if (Math.abs(x) < 50 && Math.abs(z) < 50) continue; // Center
        
        // Overlap Check: Ensure distance > sum of radii + padding
        let hasOverlap = false;
        for (const existing of obs) {
            const dx = x - existing.x;
            const dz = z - existing.z;
            const distSq = dx*dx + dz*dz;
            const minDist = r + existing.r + 10; // 10 units of extra gap
            if (distSq < minDist * minDist) {
                hasOverlap = true;
                break;
            }
        }
        
        if (!hasOverlap) {
            obs.push({ 
                x, z, r, 
                type: Math.random() > 0.4 ? 'rock' : 'ruin' // ruin will be rendered as crystals
            });
        }
    }
    return obs;
};

export const CONFIG = {
  red: { color: '#ff2222', pos: -350, name: 'DOMINION' },
  blue: { color: '#0088ff', pos: 350, name: 'RAIDERS' },
  baseHp: 50000,
  baseRange: 45,
  startMoney: 1000,
  incomeRate: 40,
  mapSize: MAP_SIZE,
  lanes: [
    { id: 'top', z: -120 },
    { id: 'mid', z: 0 },
    { id: 'bot', z: 120 }
  ],
  skill: {
    cost: 500,
    cooldown: 45,
    damage: 2500,
    radius: 35,
    duration: 3 
  }
};

export const UNITS = {
  ranger: { 
    name: 'Marine', cost: 50, hp: 120, speed: 13, range: 35, damage: 15, cooldown: 0.2, size: 1.5, type: 'ranger'
  },
  flamebat: {
    name: 'Flamebat', cost: 100, hp: 300, speed: 11, range: 18, damage: 10, cooldown: 0.05, size: 1.8, type: 'flamebat' 
  },
  ghost: {
    name: 'Ghost', cost: 150, hp: 100, speed: 12, range: 75, damage: 350, cooldown: 4.0, size: 1.4, type: 'ghost', aimTime: 1.5
  },
  tank: { 
    name: 'Siege Tank', cost: 250, hp: 1000, speed: 7, range: 65, damage: 100, cooldown: 2.5, size: 3.5, type: 'tank', aoe: 18
  },
  artillery: { 
    name: 'Thor', cost: 600, hp: 2500, speed: 5, range: 55, damage: 25, cooldown: 0.1, size: 4.5, type: 'artillery', aoe: 6 
  }
};

export const UPGRADES = [
  { id: 'atk', name: 'Stimpack', cost: 800, mul: 1.25, desc: 'Damage +25%' },
  { id: 'hp', name: 'Plating', cost: 800, mul: 1.25, desc: 'Health +25%' }
];
