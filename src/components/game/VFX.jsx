import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../../config/constants';

// Objects
const _obj = new THREE.Object3D();
const _pos = new THREE.Vector3();

// --- Instanced Manager ---
const ParticleInstances = ({ maxCount = 1000, geometry, material, particlesRef }) => {
    const meshRef = useRef();
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        const list = particlesRef.current;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (p.age < p.life) {
                p.age += delta;
                if(p.update) p.update(delta);
                _obj.position.copy(p.position);
                _obj.scale.setScalar(p.scale * (p.fade ? (1 - p.age/p.life) : 1));
                _obj.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z);
                _obj.updateMatrix();
                meshRef.current.setMatrixAt(i, _obj.matrix);
                if(p.color) meshRef.current.setColorAt(i, p.color);
            } else {
                meshRef.current.setMatrixAt(i, new THREE.Matrix4().makeScale(0,0,0));
            }
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
        if(meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });
    return <instancedMesh ref={meshRef} args={[geometry, material, maxCount]} frustumCulled={false} />;
};

const ProjectileInstances = ({ maxCount = 200, geometry, material, projectilesRef, smokesRef, explosionsRef, decalsRef, onExplode, registry, obstacles }) => {
    const meshRef = useRef();
    
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        const list = projectilesRef.current;
        const nextList = [];
        let activeIdx = 0;

        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            p.time += delta * (p.speed || 1.5);
            
            const t = p.time;
            _pos.lerpVectors(p.start, p.target, t);
            if(p.arc) _pos.y += p.arc * Math.sin(t * Math.PI);

            let hit = false;
            
            // Environment collision (HARD)
            if (obstacles) {
                for(const obs of obstacles) {
                    const dx = Math.abs(_pos.x - obs.x);
                    const dz = Math.abs(_pos.z - obs.z);
                    
                    if (obs.type === 'ruin') {
                        // Box Collision (Approx)
                        // Ruin scale is [r, 1, r] in Environment.jsx
                        if (dx < obs.r && dz < obs.r && _pos.y < 5) {
                            hit = true; break; 
                        }
                    } else {
                        // Circle Collision
                        // Rock scale is r
                        if (dx < obs.r * 0.8 && dz < obs.r * 0.8 && _pos.y < obs.r) {
                            hit = true; break; 
                        }
                    }
                }
            }

            if (!hit && t > 0.5) {
                const targets = Object.values(registry.current);
                for(const u of targets) {
                    if (u.team !== p.team && _pos.distanceToSquared(u.position) < (u.size+1)**2) {
                        hit = true; if(u.damage) u.damage(p.damage); break;
                    }
                }
            }

            if (!hit && Math.random() > 0.7) {
                spawnParticle(smokesRef, {
                    position: _pos.clone(), scale: 0.5, life: 0.5, fade: true, rotation: new THREE.Euler(Math.random(),0,0),
                    color: new THREE.Color(0x888888), update: function(dt) { this.scale += dt; }
                });
            }

            if (!hit && p.time < 1) {
                _obj.position.copy(_pos); _obj.scale.setScalar(1); _obj.rotation.set(0,0,0); _obj.updateMatrix();
                meshRef.current.setMatrixAt(activeIdx, _obj.matrix);
                meshRef.current.setColorAt(activeIdx, new THREE.Color(p.team === 'red' ? CONFIG.red.color : CONFIG.blue.color));
                activeIdx++; nextList.push(p);
            } else {
                spawnExplosion(explosionsRef, _pos, p.team==='red'?CONFIG.red.color:CONFIG.blue.color, p.aoe || 2);
                if (decalsRef) spawnDecal(decalsRef, _pos, 3 + (p.aoe || 0));
                if (p.aoe && p.time >= 1) onExplode(_pos, p.aoe, p.damage, p.team); 
            }
        }
        for(let i=activeIdx; i<maxCount; i++) meshRef.current.setMatrixAt(i, new THREE.Matrix4().makeScale(0,0,0));
        meshRef.current.instanceMatrix.needsUpdate = true;
        if(meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        projectilesRef.current = nextList;
    });
    return <instancedMesh ref={meshRef} args={[geometry, material, maxCount]} frustumCulled={false} />;
}

// Sniper Lines for Ghosts
const SniperLines = ({ snipers }) => {
    const meshRef = useRef();
    useFrame(() => {
        if(!meshRef.current) return;
        let idx = 0;
        snipers.current.forEach(s => {
            if (s.active > 0) {
                const dist = s.start.distanceTo(s.end);
                _obj.position.lerpVectors(s.start, s.end, 0.5);
                _obj.scale.set(0.05, dist, 0.05);
                _obj.lookAt(s.end);
                _obj.rotateX(Math.PI/2);
                _obj.updateMatrix();
                meshRef.current.setMatrixAt(idx++, _obj.matrix);
                s.active -= 0.016;
            }
        });
        for(let i=idx; i<100; i++) meshRef.current.setMatrixAt(i, new THREE.Matrix4().makeScale(0,0,0));
        meshRef.current.instanceMatrix.needsUpdate = true;
    });
    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, 100]} frustumCulled={false}>
            <cylinderGeometry args={[1,1,1]} />
            <meshBasicMaterial color="red" transparent opacity={0.5} depthWrite={false} />
        </instancedMesh>
    )
}

const TracerSystem = ({ tracers }) => {
    const geo = useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 1, 6), []);
    geo.rotateX(Math.PI / 2);
    const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.8 }), []);
    const meshRef = useRef();
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        const list = tracers.current;
        let activeIdx = 0;
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            if (t.age < t.life) {
                t.age += delta;
                t.progress += delta * 15; 
                if (t.progress > 1) t.progress = 1;
                _pos.lerpVectors(t.start, t.end, t.progress);
                _obj.position.copy(_pos);
                _obj.lookAt(t.end);
                _obj.scale.set(1, 1, 3); 
                _obj.updateMatrix();
                meshRef.current.setMatrixAt(activeIdx, _obj.matrix);
                meshRef.current.setColorAt(activeIdx, t.color);
                activeIdx++;
                if (t.progress >= 1) t.age = t.life + 1;
            }
        }
        for(let i=activeIdx; i<500; i++) meshRef.current.setMatrixAt(i, new THREE.Matrix4().makeScale(0,0,0));
        meshRef.current.instanceMatrix.needsUpdate = true;
        if(meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });
    return <instancedMesh ref={meshRef} args={[geo, mat, 500]} frustumCulled={false} />;
}

// Updated Decal System: Black center, fading edge
const DecalSystem = ({ decals }) => {
    // Circle with inner segments for better ground overlay
    const geo = useMemo(() => new THREE.RingGeometry(0, 1, 32), []); 
    const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#111', transparent: true, opacity: 0.8, depthWrite: false }), []); 
    const meshRef = useRef();
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        const list = decals.current;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (p.age < p.life) {
                p.age += delta;
                _obj.position.copy(p.position);
                _obj.scale.setScalar(p.scale);
                _obj.rotation.set(-Math.PI/2, 0, p.rotation.z);
                _obj.updateMatrix();
                meshRef.current.setMatrixAt(i, _obj.matrix);
                
                // Fade out logic
                if (p.age > p.life - 3) {
                    const fade = (p.life - p.age) / 3;
                    // We can't change opacity easily per instance, so we shrink it
                    _obj.scale.setScalar(p.scale * fade);
                    _obj.updateMatrix();
                    meshRef.current.setMatrixAt(i, _obj.matrix);
                }
            } else {
                meshRef.current.setMatrixAt(i, new THREE.Matrix4().makeScale(0,0,0));
            }
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });
    return <instancedMesh ref={meshRef} args={[geo, mat, 500]} frustumCulled={false} position={[0, 0.05, 0]} />;
}

export const VFXSystem = ({ projectiles, debris, smokes, flames, explosions, decals, snipers, tracers, onExplode, registry, obstacles }) => {
    const smokeGeo = useMemo(() => new THREE.DodecahedronGeometry(0.5, 0), []);
    const smokeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff', transparent: true, opacity: 0.5 }), []);
    const debrisGeo = useMemo(() => new THREE.BoxGeometry(0.5, 0.5, 0.5), []);
    const debrisMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff' }), []);
    const expGeo = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);
    const expMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff' }), []);
    const projGeo = useMemo(() => new THREE.CapsuleGeometry(0.3, 1, 4, 8), []);
    const projMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 1 }), []);
    const flameGeo = useMemo(() => new THREE.OctahedronGeometry(0.5, 0), []);
    const flameMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff5500', transparent: true, opacity: 0.8 }), []);

    return (
        <group>
            <ProjectileInstances geometry={projGeo} material={projMat} projectilesRef={projectiles} smokesRef={smokes} explosionsRef={explosions} decalsRef={decals} onExplode={onExplode} registry={registry} obstacles={obstacles} />
            <ParticleInstances maxCount={1000} geometry={smokeGeo} material={smokeMat} particlesRef={smokes} />
            <ParticleInstances maxCount={500} geometry={debrisGeo} material={debrisMat} particlesRef={debris} />
            <ParticleInstances maxCount={100} geometry={expGeo} material={expMat} particlesRef={explosions} />
            <ParticleInstances maxCount={1000} geometry={flameGeo} material={flameMat} particlesRef={flames} />
            <DecalSystem decals={decals} />
            <SniperLines snipers={snipers} />
            <TracerSystem tracers={tracers} />
        </group>
    );
};

// --- Helpers ---
const spawnParticle = (ref, data) => {
    if (ref.current.length < 1000) ref.current.push({ ...data, age: 0 });
    else { const idx = ref.current.findIndex(p => p.age >= p.life); if(idx!==-1) ref.current[idx] = { ...data, age: 0 }; }
}

export const spawnDebris = (debrisRef, pos, color) => {
    for(let i=0; i<6; i++) {
        spawnParticle(debrisRef, {
            position: pos.clone(), velocity: new THREE.Vector3((Math.random()-0.5)*10, Math.random()*10, (Math.random()-0.5)*10),
            rotation: new THREE.Euler(Math.random(),0,0), scale: 0.5+Math.random(), color: new THREE.Color(color), life: 3, fade: true,
            update: function(dt) { this.velocity.y -= 30 * dt; this.position.addScaledVector(this.velocity, dt); if(this.position.y < 0.5) { this.position.y=0.5; this.velocity.y *= -0.5; } }
        });
    }
}

export const spawnExplosion = (expRef, pos, color, size) => {
    spawnParticle(expRef, { position: pos.clone(), scale: size, color: new THREE.Color(color), life: 0.2, rotation: new THREE.Euler(0,0,0), fade: true, update: function(dt) { this.scale += dt * 20; } });
}

export const spawnSmoke = (smokeRef, pos, color, size = 0.5) => {
    spawnParticle(smokeRef, { position: pos.clone(), scale: size, life: 0.8 + Math.random() * 0.5, fade: true, rotation: new THREE.Euler(Math.random(), Math.random(), Math.random()), color: new THREE.Color(color), update: function(dt) { this.position.y += dt * 3; this.scale += dt; } });
}

export const spawnFlame = (flameRef, start, end) => {
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    for(let i=0; i<2; i++) {
        spawnParticle(flameRef, {
            position: start.clone().addScaledVector(dir, Math.random()*2), 
            scale: 0.5 + Math.random(), life: 0.4, fade: true, rotation: new THREE.Euler(Math.random(),0,0),
            color: new THREE.Color('#ffaa00'),
            update: function(dt) { 
                this.position.addScaledVector(dir, dt * 10); 
                this.position.y += dt * 2; 
                this.scale -= dt;
            }
        });
    }
}

export const spawnTracer = (tracerRef, start, end, color) => {
    const t = {
        start: start.clone(), end: end.clone(), progress: 0, age: 0, life: 0.2, color: new THREE.Color(color)
    };
    if (tracerRef.current.length < 500) tracerRef.current.push(t);
    else { tracerRef.current.shift(); tracerRef.current.push(t); }
}

export const spawnDecal = (decalRef, pos, size) => {
    spawnParticle(decalRef, { position: new THREE.Vector3(pos.x, 0.05, pos.z), scale: size, life: 15, rotation: new THREE.Euler(0, 0, Math.random() * Math.PI), color: null, fade: false });
}

export const OrbitalStrike = ({ active, position, color }) => { /* ... */ return null; };
export const Laser = ({ start, target, color, onHit }) => { /* ... */ return null; }; 
