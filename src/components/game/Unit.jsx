import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instances, Instance, Html } from '@react-three/drei';
import * as THREE from 'three';
import { CONFIG, UNITS } from '../../config/constants';
import { spawnSmoke, spawnFlame } from './VFX';

const _tempVec = new THREE.Vector3();
const _diff = new THREE.Vector3();
const _targetPos = new THREE.Vector3();

// --- Logic Component ---
const UnitLogicRenderer = ({ u, type, registry, smokes, flames, snipers, onFire, onDeath, upgrades, obstacles }) => {
    const { id, team, lane } = u;
    const baseStats = UNITS[type] || UNITS.tank; 
    const stats = useMemo(() => ({
        ...baseStats,
        hp: baseStats.hp * (upgrades.hp || 1),
        damage: baseStats.damage * (upgrades.atk || 1)
    }), [type, upgrades, baseStats]);

    const ref = useRef();
    const hpBarRef = useRef();
    const color = team === 'red' ? CONFIG.red.color : CONFIG.blue.color;
    
    const internal = useRef({
        hp: stats.hp, maxHp: stats.hp, cooldown: 0, hitFlash: 0, recoil: 0,
        targetId: null, logicTimer: Math.random(), separationForce: new THREE.Vector3(),
        currentTarget: null, aiming: 0,
        velocity: new THREE.Vector3(),
        formationOffset: (Math.random() - 0.5) * 180, 
        pos: new THREE.Vector3(
            team === 'red' ? CONFIG.red.pos : CONFIG.blue.pos, 
            0, 
            (Math.random()-0.5) * 180 + (CONFIG.lanes.find(l => l.id === lane)||CONFIG.lanes[0]).z
        ),
        waypoint: new THREE.Vector3(
            team === 'red' ? CONFIG.blue.pos : CONFIG.red.pos, 
            0, 
            (CONFIG.lanes.find(l => l.id === lane)||CONFIG.lanes[0]).z
        )
    });

    useEffect(() => {
        registry.current[id] = {
            id, team, position: internal.current.pos, 
            quaternion: new THREE.Quaternion(), 
            type, size: stats.size,
            damage: (amt) => {
                internal.current.hp -= amt;
                internal.current.hitFlash = 0.2;
                if (internal.current.hp <= 0) onDeath(id, internal.current.pos, color);
            }
        };
        return () => { delete registry.current[id]; };
    }, [id, team, registry, onDeath, color, stats.size]);

    useFrame((state, delta) => {
        if (!ref.current || internal.current.hp <= 0) return;
        const self = internal.current;
        
        if (self.hitFlash > 0) { self.hitFlash -= delta; ref.current.color.setHex(0xffffff); } 
        else ref.current.color.set(color);
        
        if (self.hp < self.maxHp * 0.4) {
            if (Math.random() > (self.hp / (self.maxHp * 0.4)) && smokes && Math.random() > 0.8) 
                spawnSmoke(smokes, self.pos.clone().add(new THREE.Vector3(0, 2, 0)), '#555', 0.5);
        }
        if (self.recoil > 0) self.recoil = Math.max(0, self.recoil - delta * 5);
        self.cooldown -= delta;

        self.logicTimer += delta;
        if (self.logicTimer > 0.1) {
            self.logicTimer = 0;
            let target = null;
            let minDist = Infinity;
            _tempVec.set(0,0,0);
            let sepCount = 0;

            const allUnits = Object.values(registry.current);
            const aggroRange = 350; 

            for (const other of allUnits) {
                if (other.id === id) continue;
                const dx = self.pos.x - other.position.x;
                const dz = self.pos.z - other.position.z;
                if (Math.abs(dx) > aggroRange || Math.abs(dz) > aggroRange) continue;
                
                const distSq = dx*dx + dz*dz;
                const sizeSum = stats.size + (other.size || 2);
                
                // Separation
                if (distSq < sizeSum*sizeSum) {
                    const d = Math.sqrt(distSq);
                    // Stronger push for units of same team (Form line)
                    const force = other.team === team ? 3 : 1; 
                    _diff.set(dx, 0, dz).normalize().multiplyScalar((sizeSum - d) * force); 
                    _tempVec.add(_diff);
                    sepCount++;
                }
                
                // Target Selection
                if (other.team !== team) {
                    // Smart Targeting: Pick closest enemy
                    if (distSq < minDist) {
                        minDist = distSq;
                        target = other;
                    }
                }
            }

            if (obstacles) {
                for(const obs of obstacles) {
                    const dx = self.pos.x - obs.x;
                    const dz = self.pos.z - obs.z;
                    if (Math.abs(dx) > 50 && Math.abs(dz) > 50) continue;
                    const distSq = dx*dx + dz*dz;
                    const minD = stats.size + obs.r + 1;
                    if(distSq < minD*minD) {
                        const d = Math.sqrt(distSq);
                        _diff.set(dx, 0, dz).normalize().multiplyScalar((minD - d) * 5);
                        _tempVec.add(_diff);
                        sepCount++;
                    }
                }
            }

            self.separationForce.copy(_tempVec);
            if(sepCount > 0) self.separationForce.normalize().multiplyScalar(stats.speed * 1.5);
            
            if (target && !registry.current[target.id]) target = null;
            self.currentTarget = target;
            if (target) self.targetId = target.id;
        }

        const target = self.currentTarget;
        let aimTarget = null;
        let isMoving = false;
        let isAttacking = false;

        // --- BATTLE LINE LOGIC ---
        if (target) {
            aimTarget = target.position;
            const dist = self.pos.distanceTo(target.position);
            
            // Check if we are in range
            const inRange = dist <= stats.range;
            
            // STOP TO FIRE RULE:
            // If in range AND cooldown is ready (or almost ready), STOP.
            // This creates the "Stutter Step" effect.
            if (inRange && self.cooldown <= 0.2) {
                isAttacking = true;
                // Force Stop
                internal.current.velocity.set(0,0,0); 
                
                // Fire Logic
                if (self.cooldown <= 0) {
                    // Delay fire slightly if we just stopped? No, instant response is better.
                    
                    if (type === 'ghost') {
                        // Ghost Aiming Logic
                        self.aiming += delta;
                        if (self.aiming >= stats.aimTime) {
                            self.aiming = 0; self.cooldown = stats.cooldown;
                            if (registry.current[target.id]) {
                                registry.current[target.id].damage(stats.damage);
                                onFire(type, self.pos, target.position, color, 0, 0);
                            }
                        } else {
                            if (snipers && snipers.current) snipers.current.push({ start: self.pos.clone().add(new THREE.Vector3(0,2,0)), end: target.position.clone(), active: 0.1 });
                        }
                    } else if (type === 'flamebat') {
                        self.cooldown = stats.cooldown;
                        if (flames) spawnFlame(flames, self.pos.clone().add(new THREE.Vector3(0,1,0)), target.position);
                        if (registry.current[target.id]) registry.current[target.id].damage(stats.damage);
                    } else {
                        // Projectile Units
                        self.cooldown = stats.cooldown;
                        self.recoil = 1.5; // Strong recoil visual
                        const startPos = self.pos.clone().add(new THREE.Vector3(0, 3, 0));
                        if (type === 'artillery') {
                            for(let i=0; i<4; i++) {
                                setTimeout(() => { if(internal.current.hp > 0) onFire(type, startPos, target.position.clone().add(new THREE.Vector3((Math.random()-0.5)*5,0,0)), color, stats.damage/4, stats.aoe); }, i * 100);
                            }
                        } else {
                            onFire(type, startPos, target.position.clone(), color, stats.damage, stats.aoe);
                        }
                    }
                }
            } else {
                // Not in range OR cooldown high -> Move closer
                // If blocked by friends (separation force high) AND close enough to target?
                // No, just try to move.
                _tempVec.copy(target.position).sub(self.pos).normalize().multiplyScalar(stats.speed);
                internal.current.velocity.lerp(_tempVec, 0.1);
                isMoving = true;
                self.aiming = 0;
            }
        } else {
            // March
            self.aiming = 0;
            if (self.pos.distanceTo(self.waypoint) > 20) {
                 const laneZ = self.waypoint.z; 
                 const desiredZ = laneZ + self.formationOffset;
                 _targetPos.set(self.waypoint.x, 0, desiredZ);
                 _tempVec.copy(_targetPos).sub(self.pos).normalize().multiplyScalar(stats.speed);
                 internal.current.velocity.lerp(_tempVec, 0.1); 
                 aimTarget = self.pos.clone().add(internal.current.velocity);
                 isMoving = true;
            }
        }

        // Apply Physics (Separation) always
        // But if attacking (stationary), reduce separation effect to prevent jitter while shooting?
        // No, we want them to be pushed if overlapping.
        if (self.separationForce.lengthSq() > 0.01) {
            internal.current.velocity.add(self.separationForce.multiplyScalar(0.2));
            isMoving = true;
        }

        // Apply Velocity
        // If attacking, velocity was force-set to 0, but separation might add some back.
        // We allow separation to push attacking units slowly (sliding).
        self.pos.addScaledVector(internal.current.velocity, delta);

        // Update Visuals
        if (ref.current) {
            const renderPos = self.pos.clone();
            
            // Visual Recoil
            if (self.recoil > 0 && aimTarget) {
                const back = new THREE.Vector3().subVectors(self.pos, aimTarget).normalize().multiplyScalar(self.recoil);
                renderPos.add(back);
            }
            ref.current.position.copy(renderPos);
            
            // Rotation Logic
            if (aimTarget) {
                // Slerp rotation
                const dummy = ref.current.clone(); 
                dummy.position.copy(ref.current.position);
                dummy.lookAt(aimTarget.x, 0, aimTarget.z);
                
                // If moving, slow turn. If attacking (locked on), fast turn/snap.
                const turnSpeed = isAttacking ? 0.3 : 0.1;
                ref.current.quaternion.slerp(dummy.quaternion, turnSpeed); 
            }
            
            // Sync registry quaternion for parts
            if (registry.current[id]) {
                registry.current[id].quaternion.copy(ref.current.quaternion);
            }
            
            // Walking Bob
            if (isMoving && !isAttacking) {
                ref.current.position.y = 0 + Math.abs(Math.sin(Date.now() * 0.005 * stats.speed)) * 0.5;
            }
            
            // Ghost Fade
            if (type === 'ghost') {
                if (self.aiming > 0) ref.current.visible = true; 
                else ref.current.visible = Math.random() > 0.5;
            }
        }

        if (hpBarRef.current) {
            if (self.hp < self.maxHp) {
                hpBarRef.current.style.display = 'block';
                hpBarRef.current.children[0].style.width = `${(self.hp / self.maxHp) * 40}px`;
            } else {
                hpBarRef.current.style.display = 'none';
            }
        }
    });

    return (
        <Instance ref={ref}>
            <Html position={[0, stats.size + 3, 0]} center ref={hpBarRef} className="hp-container" style={{width: '40px', display: 'none'}}>
               <div className="hp-bar" style={{ background: color, border: '1px solid #fff' }}></div>
            </Html>
        </Instance>
    );
};

const VisualPart = ({ u, registry, offset }) => {
    const ref = useRef();
    useFrame(() => {
        const data = registry.current && registry.current[u.id];
        if (data && ref.current && data.position) {
            ref.current.visible = true;
            ref.current.position.copy(data.position);
            if (data.quaternion) ref.current.quaternion.copy(data.quaternion);
            const vOffset = new THREE.Vector3(...offset);
            vOffset.applyQuaternion(ref.current.quaternion);
            ref.current.position.add(vOffset);
        } else if (ref.current) {
            ref.current.visible = false;
        }
    });
    return <Instance ref={ref} />;
};

export const UnitGroup = ({ type, units, registry, smokes, flames, snipers, onFire, onDeath, upgrades, obstacles }) => {
    const marineBody = useMemo(() => new THREE.CapsuleGeometry(0.6, 1.5, 4, 8), []);
    const flameBody = useMemo(() => new THREE.CylinderGeometry(1, 1, 2, 8), []);
    const ghostBody = useMemo(() => new THREE.CapsuleGeometry(0.5, 1.8, 4, 8), []);
    const tankBody = useMemo(() => new THREE.BoxGeometry(3.5, 1.5, 4.5), []);
    const thorBody = useMemo(() => new THREE.BoxGeometry(4, 5, 3), []);
    const turretGeo = useMemo(() => new THREE.CylinderGeometry(1, 1.5, 4, 8), []);
    const gunGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 3), []);

    return (
        <>
            <Instances range={1000} geometry={type==='tank'?tankBody : type==='artillery'?thorBody : type==='flamebat'?flameBody : type==='ghost'?ghostBody : marineBody} castShadow receiveShadow frustumCulled={false}>
                <meshStandardMaterial color={type==='ghost'?'#aaa':'#fff'} roughness={0.5} transparent={type==='ghost'} opacity={type==='ghost'?0.3:1} />
                {units.map(u => (
                    <UnitLogicRenderer key={u.id} u={u} type={type} registry={registry} smokes={smokes} flames={flames} snipers={snipers} onFire={onFire} onDeath={onDeath} upgrades={upgrades} obstacles={obstacles} />
                ))}
            </Instances>

            {type === 'tank' && (
                <Instances range={500} geometry={turretGeo} castShadow frustumCulled={false}>
                    <meshStandardMaterial color="#333" />
                    {units.map(u => <VisualPart key={u.id} u={u} registry={registry} offset={[0, 1.5, 0]} />)}
                </Instances>
            )}
            
            {type === 'ranger' && (
                <Instances range={1000} geometry={gunGeo} castShadow frustumCulled={false}>
                    <meshStandardMaterial color="#222" />
                    {units.map(u => <VisualPart key={u.id} u={u} registry={registry} offset={[0.5, 0.5, 0.5]} />)}
                </Instances>
            )}

            {type === 'flamebat' && (
                <Instances range={500} geometry={new THREE.BoxGeometry(0.5, 1, 1)} castShadow frustumCulled={false}>
                    <meshStandardMaterial color="#ff5500" />
                    {units.map(u => <VisualPart key={u.id} u={u} registry={registry} offset={[0.8, 0.5, 0.5]} />)}
                </Instances>
            )}

            {type === 'artillery' && (
                <Instances range={500} geometry={gunGeo} castShadow frustumCulled={false}>
                    <meshStandardMaterial color="#222" />
                    {units.map(u => <VisualPart key={u.id} u={u} registry={registry} offset={[2.5, 2, 0]} />)}
                </Instances>
            )}
             {type === 'artillery' && (
                <Instances range={500} geometry={gunGeo} castShadow frustumCulled={false}>
                    <meshStandardMaterial color="#222" />
                    {units.map(u => <VisualPart key={u.id} u={u} registry={registry} offset={[-2.5, 2, 0]} />)}
                </Instances>
            )}
        </>
    );
};
