import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../../config/constants';

// Pre-allocated reusable objects (avoid GC pressure)
const _obj = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
const _redColor = new THREE.Color(CONFIG.red.color);
const _blueColor = new THREE.Color(CONFIG.blue.color);
const _tempColor = new THREE.Color();

// Shared update functions (avoid per-particle closure allocation)
function smokeExpandUpdate(dt) { this.scale += dt; }
function debrisPhysicsUpdate(dt) {
    this.velocity.y -= 30 * dt;
    this.position.addScaledVector(this.velocity, dt);
    if (this.position.y < 0.5) { this.position.y = 0.5; this.velocity.y *= -0.5; }
}
function smokeRiseUpdate(dt) { this.position.y += dt * 3; this.scale += dt; }
function flameDirectionUpdate(dt) {
    this.position.addScaledVector(this._dir, dt * 10);
    this.position.y += dt * 2;
    this.scale -= dt;
}

// --- Instanced Manager ---
const ParticleInstances = ({ maxCount = 1000, geometry, material, particlesRef }) => {
    const meshRef = useRef();
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        const mesh = meshRef.current;
        const list = particlesRef.current;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (p.age < p.life) {
                p.age += delta;
                if (p.update) p.update(delta);
                _obj.position.copy(p.position);
                _obj.scale.setScalar(p.scale * (p.fade ? (1 - p.age / p.life) : 1));
                _obj.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z);
                _obj.updateMatrix();
                mesh.setMatrixAt(i, _obj.matrix);
                if (p.color) mesh.setColorAt(i, p.color);
            } else {
                mesh.setMatrixAt(i, _zeroMatrix);
            }
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    return <instancedMesh ref={meshRef} args={[geometry, material, maxCount]} frustumCulled={false} />;
};

// Pre-allocated smoke color for projectile trails
const _smokeGray = new THREE.Color(0x888888);

const ProjectileInstances = ({ maxCount = 200, geometry, material, projectilesRef, smokesRef, explosionsRef, decalsRef, onExplode, registry, obstacles }) => {
    const meshRef = useRef();

    useFrame((_, delta) => {
        if (!meshRef.current) return;
        const mesh = meshRef.current;
        const list = projectilesRef.current;
        const nextList = [];
        let activeIdx = 0;

        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            p.time += delta * (p.speed || 1.5);

            const t = p.time;
            _pos.lerpVectors(p.start, p.target, t);
            if (p.arc) _pos.y += p.arc * Math.sin(t * Math.PI);

            let hit = false;

            // Environment collision - with early-exit distance check
            if (obstacles) {
                for (let oi = 0, ol = obstacles.length; oi < ol; oi++) {
                    const obs = obstacles[oi];
                    const dx = Math.abs(_pos.x - obs.x);
                    const dz = Math.abs(_pos.z - obs.z);

                    // Early exit: skip obstacles clearly out of range
                    const maxR = obs.r + 2;
                    if (dx > maxR || dz > maxR) continue;

                    if (obs.type === 'ruin') {
                        if (dx < obs.r && dz < obs.r && _pos.y < 5) {
                            hit = true; break;
                        }
                    } else {
                        if (dx < obs.r * 0.8 && dz < obs.r * 0.8 && _pos.y < obs.r) {
                            hit = true; break;
                        }
                    }
                }
            }

            if (!hit && t > 0.5) {
                const regEntries = registry.current;
                const keys = Object.keys(regEntries);
                for (let ki = 0, kl = keys.length; ki < kl; ki++) {
                    const u = regEntries[keys[ki]];
                    if (u.team !== p.team && _pos.distanceToSquared(u.position) < (u.size + 1) ** 2) {
                        hit = true; if (u.damage) u.damage(p.damage); break;
                    }
                }
            }

            // Smoke trail - use shared color and update function
            if (!hit && Math.random() > 0.7) {
                spawnParticle(smokesRef, {
                    position: _pos.clone(), scale: 0.5, life: 0.5, fade: true,
                    rotation: { x: Math.random(), y: 0, z: 0 },
                    color: _smokeGray, update: smokeExpandUpdate
                });
            }

            if (!hit && p.time < 1) {
                _obj.position.copy(_pos); _obj.scale.setScalar(1); _obj.rotation.set(0, 0, 0); _obj.updateMatrix();
                mesh.setMatrixAt(activeIdx, _obj.matrix);
                _tempColor.copy(p.team === 'red' ? _redColor : _blueColor);
                mesh.setColorAt(activeIdx, _tempColor);
                activeIdx++; nextList.push(p);
            } else {
                spawnExplosion(explosionsRef, _pos, p.team === 'red' ? CONFIG.red.color : CONFIG.blue.color, p.aoe || 2);
                if (decalsRef) spawnDecal(decalsRef, _pos, 3 + (p.aoe || 0));
                if (p.aoe && p.time >= 1) onExplode(_pos, p.aoe, p.damage, p.team);
            }
        }
        for (let i = activeIdx; i < maxCount; i++) mesh.setMatrixAt(i, _zeroMatrix);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        projectilesRef.current = nextList;
    });
    return <instancedMesh ref={meshRef} args={[geometry, material, maxCount]} frustumCulled={false} />;
}

// Sniper Lines for Ghosts
const SniperLines = ({ snipers }) => {
    const meshRef = useRef();
    useFrame(() => {
        if (!meshRef.current) return;
        const mesh = meshRef.current;
        const list = snipers.current;
        let idx = 0;
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            if (s.active > 0) {
                const dist = s.start.distanceTo(s.end);
                _obj.position.lerpVectors(s.start, s.end, 0.5);
                _obj.scale.set(0.05, dist, 0.05);
                _obj.lookAt(s.end);
                _obj.rotateX(Math.PI / 2);
                _obj.updateMatrix();
                mesh.setMatrixAt(idx++, _obj.matrix);
                s.active -= 0.016;
            }
        }
        for (let i = idx; i < 100; i++) mesh.setMatrixAt(i, _zeroMatrix);
        mesh.instanceMatrix.needsUpdate = true;
    });
    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, 100]} frustumCulled={false}>
            <cylinderGeometry args={[1,1,1]} />
            <meshBasicMaterial color="red" transparent opacity={0.5} depthWrite={false} />
        </instancedMesh>
    )
}

const TracerSystem = ({ tracers }) => {
    const geo = useMemo(() => {
        const g = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);
        g.rotateX(Math.PI / 2);
        return g;
    }, []);
    const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.8 }), []);
    const meshRef = useRef();
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        const mesh = meshRef.current;
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
                mesh.setMatrixAt(activeIdx, _obj.matrix);
                mesh.setColorAt(activeIdx, t.color);
                activeIdx++;
                if (t.progress >= 1) t.age = t.life + 1;
            }
        }
        for (let i = activeIdx; i < 500; i++) mesh.setMatrixAt(i, _zeroMatrix);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    return <instancedMesh ref={meshRef} args={[geo, mat, 500]} frustumCulled={false} />;
}

// Updated Decal System: Black center, fading edge
const DecalSystem = ({ decals }) => {
    const geo = useMemo(() => new THREE.RingGeometry(0, 1, 32), []);
    const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#111', transparent: true, opacity: 0.8, depthWrite: false }), []);
    const meshRef = useRef();
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        const mesh = meshRef.current;
        const list = decals.current;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (p.age < p.life) {
                p.age += delta;
                _obj.position.copy(p.position);
                // Compute scale once including fade
                let s = p.scale;
                if (p.age > p.life - 3) {
                    s = p.scale * ((p.life - p.age) / 3);
                }
                _obj.scale.setScalar(s);
                _obj.rotation.set(-Math.PI / 2, 0, p.rotation.z);
                _obj.updateMatrix();
                mesh.setMatrixAt(i, _obj.matrix);
            } else {
                mesh.setMatrixAt(i, _zeroMatrix);
            }
        }
        mesh.instanceMatrix.needsUpdate = true;
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
    const list = ref.current;
    if (list.length < 1000) {
        list.push({ ...data, age: 0 });
    } else {
        // Recycle dead particle slot with for loop (avoids findIndex closure)
        for (let i = 0; i < list.length; i++) {
            if (list[i].age >= list[i].life) {
                list[i] = { ...data, age: 0 };
                return;
            }
        }
    }
}

export const spawnDebris = (debrisRef, pos, color) => {
    const c = new THREE.Color(color);
    for (let i = 0; i < 6; i++) {
        spawnParticle(debrisRef, {
            position: pos.clone(),
            velocity: new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 10, (Math.random() - 0.5) * 10),
            rotation: { x: Math.random(), y: 0, z: 0 }, scale: 0.5 + Math.random(), color: c, life: 3, fade: true,
            update: debrisPhysicsUpdate
        });
    }
}

export const spawnExplosion = (expRef, pos, color, size) => {
    spawnParticle(expRef, {
        position: pos.clone(), scale: size, color: new THREE.Color(color), life: 0.2,
        rotation: { x: 0, y: 0, z: 0 }, fade: true,
        update: function (dt) { this.scale += dt * 20; }
    });
}

export const spawnSmoke = (smokeRef, pos, color, size = 0.5) => {
    spawnParticle(smokeRef, {
        position: pos.clone(), scale: size, life: 0.8 + Math.random() * 0.5, fade: true,
        rotation: { x: Math.random(), y: Math.random(), z: Math.random() },
        color: new THREE.Color(color), update: smokeRiseUpdate
    });
}

export const spawnFlame = (flameRef, start, end) => {
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    for (let i = 0; i < 2; i++) {
        spawnParticle(flameRef, {
            position: start.clone().addScaledVector(dir, Math.random() * 2),
            scale: 0.5 + Math.random(), life: 0.4, fade: true,
            rotation: { x: Math.random(), y: 0, z: 0 },
            color: new THREE.Color('#ffaa00'),
            _dir: dir.clone(),
            update: flameDirectionUpdate
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
    spawnParticle(decalRef, {
        position: new THREE.Vector3(pos.x, 0.05, pos.z), scale: size, life: 15,
        rotation: { x: 0, y: 0, z: Math.random() * Math.PI }, color: null, fade: false
    });
}

export const OrbitalStrike = ({ active, position, color }) => { /* ... */ return null; };
export const Laser = ({ start, target, color, onHit }) => { /* ... */ return null; };  
