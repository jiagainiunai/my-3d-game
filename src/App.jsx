import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { nanoid } from 'nanoid';
import './App.css';

import { CONFIG, UNITS, generateObstacles } from './config/constants';
import { GameManager } from './components/logic/GameManager';
import { GameUI } from './components/ui/GameUI';
import { UnitGroup } from './components/game/Unit';
import { Nexus } from './components/game/Nexus';
import { Environment } from './components/game/Environment';
import { 
  VFXSystem, OrbitalStrike, spawnDebris, spawnExplosion, spawnDecal, spawnTracer
} from './components/game/VFX';

const GroundCursor = ({ radius, color }) => {
    const { raycaster, mouse, camera, scene } = useThree();
    const ref = useRef();
    useFrame(() => {
        if (!ref.current) return;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children);
        if (intersects.length > 0) {
             ref.current.position.copy(intersects[0].point);
             ref.current.position.y = 0.5;
        }
    });
    return (
        <mesh ref={ref} rotation={[-Math.PI/2, 0, 0]}>
            <ringGeometry args={[radius - 0.2, radius, 32]} />
            <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
    );
};

export default function App() {
  const [gameState, setGameState] = useState('menu');
  const [gameKey, setGameKey] = useState(0);
  const [autoMode, setAutoMode] = useState(false);
  const [gameTime, setGameTime] = useState(0);
  const [money, setMoney] = useState(CONFIG.startMoney);
  const [baseHp, setBaseHp] = useState({ red: CONFIG.baseHp, blue: CONFIG.baseHp });
  const [scores, setScores] = useState({ winner: null });
  const [skillReady, setSkillReady] = useState(true);
  const [tech, setTech] = useState({ atk: 0, hp: 0 });
  const [unitCounts, setUnitCounts] = useState({ red: 0, blue: 0 });

  // Generate Map Data (350 objects for heavy coverage)
  const obstacles = useMemo(() => generateObstacles(CONFIG.mapSize, 350), [gameKey]);

  const [units, setUnits] = useState([]);
  const [skillActive, setSkillActive] = useState(false); 
  const [orbitalStrike, setOrbitalStrike] = useState(null); 

  const registry = useRef({});
  const projectiles = useRef([]);
  const explosions = useRef([]);
  const debris = useRef([]);
  const smokes = useRef([]); 
  const flames = useRef([]);
  const decals = useRef([]); 
  const snipers = useRef([]);
  const tracers = useRef([]);
  
  const aiTimer = useRef(0);
  const autoTimer = useRef(0);
  const skillCdTimer = useRef(0);

  const spawnUnit = (team, type, lane = null) => {
    const id = nanoid();
    setUnits(p => [...p, { id, type, team, lane: lane || (Math.random()>0.5 ? 'top':'bot') }]);
    setUnitCounts(prev => ({ ...prev, [team]: prev[team] + 1 }));
  };

  const handlePlayerSpawn = (type) => {
    if (gameState !== 'playing' || autoMode) return;
    if (money >= UNITS[type].cost) { setMoney(m => m - UNITS[type].cost); spawnUnit('blue', type); }
  };

  const handleUpgrade = (id, cost) => {
      if (gameState !== 'playing' || autoMode) return;
      if (money >= cost) { setMoney(m => m - cost); setTech(p => ({ ...p, [id]: p[id] + 1 })); }
  };

  const executeSkill = (point) => {
      setSkillActive(false); setMoney(m => m - CONFIG.skill.cost); setSkillReady(false); skillCdTimer.current = CONFIG.skill.cooldown;
      setOrbitalStrike({ active: true, pos: point });
      setTimeout(() => setOrbitalStrike(null), 4000); 
      setTimeout(() => {
          const r2 = CONFIG.skill.radius * CONFIG.skill.radius;
          Object.values(registry.current).forEach(u => {
              if (u.team === 'red' && u.position.distanceToSquared(point) <= r2) u.damage(CONFIG.skill.damage);
          });
      }, 2000);
  };

  const handleFire = useCallback((type, start, target, color, damage, aoe) => {
    if (type === 'artillery' || type === 'tank' || type === 'turret') {
        projectiles.current.push({ 
            id: nanoid(), start, target, team: color === CONFIG.red.color ? 'red' : 'blue',
            aoe: aoe, damage, time: 0, speed: type==='tank'?3:type==='turret'?4:1.5, arc: type==='artillery'?15:type==='tank'?5:0
        });
    } else if (type === 'ghost' || type === 'flamebat') {
    } else {
        spawnTracer(tracers, start, target, color);
        spawnExplosion(explosions, target, color, 1);
        const hitRadiusSq = 4*4;
        const targets = Object.values(registry.current);
        const attackerTeam = color === CONFIG.red.color ? 'red' : 'blue';
        for(const u of targets) {
            if (u.team !== attackerTeam && u.position.distanceToSquared(target) < hitRadiusSq) {
                if(u.damage) u.damage(damage);
                break;
            }
        }
    }
  }, []);

  const handleExplode = (pos, radius, damage, teamColor) => {
      const r2 = radius * radius;
      const attackerTeam = teamColor; 
      Object.values(registry.current).forEach(u => {
          if (u.team !== attackerTeam && u.position.distanceToSquared(pos) <= r2) u.damage(damage);
      });
      spawnExplosion(explosions, pos, attackerTeam==='red'?CONFIG.red.color:CONFIG.blue.color, radius);
  };

  const handleDeath = useCallback((id, pos, color) => {
      setUnits(p => p.filter(u => u.id !== id));
      const team = color === CONFIG.red.color ? 'red' : 'blue';
      setUnitCounts(prev => ({ ...prev, [team]: Math.max(0, prev[team] - 1) }));
      spawnDebris(debris, pos, color);
      spawnExplosion(explosions, pos, color, 2);
      spawnDecal(decals, pos, 4);
  }, []);

  const renderUnitGroup = (type) => (
      <UnitGroup 
          key={type} type={type} units={units.filter(u => u.type === type)} 
          registry={registry} smokes={smokes} flames={flames} snipers={snipers}
          onFire={handleFire} onDeath={handleDeath} upgrades={tech} 
          obstacles={obstacles}
      />
  );

  return (
    <div className="app-container">
      <GameUI 
        gameState={gameState} money={money} baseHp={baseHp} scores={scores} gameTime={gameTime}
        autoMode={autoMode} skillReady={skillReady} upgrades={tech} unitCounts={unitCounts}
        onStart={(auto) => {
            setGameState('playing'); setAutoMode(auto); setGameKey(k=>k+1);
            setMoney(CONFIG.startMoney); setBaseHp({red: CONFIG.baseHp, blue: CONFIG.baseHp});
            setUnits([]); registry.current = {}; setUnitCounts({red:0, blue:0}); setGameTime(0);
            projectiles.current = []; explosions.current = []; debris.current = []; smokes.current = []; decals.current = []; flames.current = []; snipers.current = []; tracers.current = [];
            setTech({atk:0, hp:0}); setSkillReady(true);
        }}
        onSpawn={handlePlayerSpawn} onUpgrade={handleUpgrade}
        onSkill={() => { if(skillReady && money>=CONFIG.skill.cost) setSkillActive(true); }} 
        onToggleAuto={() => setAutoMode(!autoMode)}
      />

      <Canvas key={gameKey} camera={{ position: [0, 150, 120], fov: 45, far: 2500 }} dpr={[1, 1.5]} onClick={(e) => { if(skillActive) executeSkill(e.point); }}>
        <GameManager 
            gameState={gameState} setMoney={setMoney} skillReady={skillReady} 
            setSkillReady={setSkillReady} skillCdTimer={skillCdTimer} aiTimer={aiTimer}
            spawnUnit={spawnUnit} autoMode={autoMode}
            money={money} handleUpgrade={handleUpgrade} setGameTime={setGameTime}
        />

        <Environment obstacles={obstacles} />
        
        <ambientLight intensity={0.5} />
        <directionalLight position={[0, 100, 0]} intensity={1} />

        {skillActive && <GroundCursor radius={CONFIG.skill.radius} color={CONFIG.blue.color} />}
        <OrbitalStrike {...orbitalStrike} color={CONFIG.blue.color} decals={decals} explosions={explosions} />

        <Nexus team="red" registry={registry} onFire={handleFire} onDamage={(t, hp) => setBaseHp(p => ({...p, [t]: hp}))} onDeath={() => setGameState('ended')} />
        <Nexus team="blue" registry={registry} onFire={handleFire} onDamage={(t, hp) => setBaseHp(p => ({...p, [t]: hp}))} onDeath={() => setGameState('ended')} />

        {renderUnitGroup('tank')}
        {renderUnitGroup('ranger')}
        {renderUnitGroup('artillery')}
        {renderUnitGroup('flamebat')}
        {renderUnitGroup('ghost')}

        <VFXSystem 
            projectiles={projectiles} debris={debris} smokes={smokes} flames={flames} explosions={explosions} decals={decals} snipers={snipers} tracers={tracers}
            onExplode={handleExplode} registry={registry} obstacles={obstacles}
        />
        
        <OrbitControls maxPolarAngle={Math.PI/2.1} minDistance={50} maxDistance={800} enablePan={true} />
      </Canvas>
    </div>
  );
}
