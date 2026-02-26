import React, { useMemo } from 'react';
import { Instances, Instance, Sky, Stars, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

const Ground = () => {
  return (
    <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
      <planeGeometry args={[1500, 1500]} />
      <meshStandardMaterial color="#2a2825" roughness={1} metalness={0} />
    </mesh>
  )
}

// Fixed structures at the center
const CenterFortress = () => (
    <group>
        {/* Huge Central Peak */}
        <mesh position={[0, 6, 0]} rotation={[0, Math.PI/4, 0]}>
            <cylinderGeometry args={[12, 18, 12, 6]} />
            <meshStandardMaterial color="#444" roughness={0.8} />
        </mesh>
        
        {/* Decorative Monoliths */}
        <mesh position={[30, 15, 20]} castShadow>
            <boxGeometry args={[8, 30, 8]} />
            <meshStandardMaterial color="#333" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[-30, 15, -20]} castShadow>
            <boxGeometry args={[8, 30, 8]} />
            <meshStandardMaterial color="#333" metalness={0.8} roughness={0.2} />
        </mesh>
    </group>
);

const EnvironmentInstances = ({ obstacles }) => {
    const rockGeo = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
    const crystalGeo = useMemo(() => new THREE.OctahedronGeometry(1, 0), []);
    
    // Sort obstacles based on type
    const rocks = useMemo(() => obstacles.filter(o => o.type === 'rock' || o.type === 'mountain'), [obstacles]);
    const crystals = useMemo(() => obstacles.filter(o => o.type === 'ruin'), [obstacles]);

    return (
        <group>
            {/* Massive Rocks */}
            <Instances range={rocks.length} geometry={rockGeo} castShadow receiveShadow frustumCulled={false}>
                <meshStandardMaterial color="#544" roughness={0.9} />
                {rocks.map((o, i) => (
                    <Instance 
                        key={i} 
                        position={[o.x, 0, o.z]} 
                        scale={[o.r, o.r * 0.75, o.r]} 
                        rotation={[Math.random(), Math.random(), Math.random()]} 
                    />
                ))}
            </Instances>

            {/* Glowing Crystals */}
            <Instances range={crystals.length} geometry={crystalGeo} castShadow receiveShadow frustumCulled={false}>
                <meshStandardMaterial 
                    color="#00eeff" 
                    emissive="#0066aa" 
                    emissiveIntensity={1} 
                    roughness={0.1} 
                    metalness={0.9} 
                />
                {crystals.map((o, i) => (
                    <Instance 
                        key={i} 
                        position={[o.x, o.r * 0.5, o.z]} 
                        scale={[o.r * 0.8, o.r * 2.5, o.r * 0.8]} 
                        rotation={[0, Math.random() * Math.PI, 0]} 
                    />
                ))}
            </Instances>
        </group>
    )
}

export const Environment = React.memo(({ obstacles }) => {
  return (
    <>
        <ambientLight intensity={0.6} />
        <directionalLight 
          position={[-150, 250, 100]} 
          intensity={2.5} 
          castShadow 
          shadow-mapSize={[2048, 2048]} 
        />
        <hemisphereLight skyColor="#4466ff" groundColor="#111" intensity={0.4} />
        
        <Sky sunPosition={[-150, 250, 100]} turbidity={5} rayleigh={0.2} />
        <Stars radius={400} depth={100} count={1500} factor={6} fade />
        
        <ContactShadows resolution={512} scale={1000} blur={2.5} opacity={0.6} far={20} color="#000" />

        <Ground />
        <CenterFortress />
        <EnvironmentInstances obstacles={obstacles} />
        
        {/* Distant fog for depth */}
        <fog attach="fog" args={['#1a1815', 300, 1500]} />
    </>
  );
});
