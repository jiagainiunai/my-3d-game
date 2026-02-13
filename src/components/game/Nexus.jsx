import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Text } from '@react-three/drei';
import * as THREE from 'three';
import { CONFIG } from '../../config/constants';

// Reusable Geo
const baseGeo = new THREE.CylinderGeometry(6, 7, 2, 6);
const barrelGeo = new THREE.CylinderGeometry(0.3, 0.3, 4);

export const Nexus = ({ team, registry, onFire, onDamage, onDeath }) => {
  const conf = team === 'red' ? CONFIG.red : CONFIG.blue;
  const hp = useRef(CONFIG.baseHp);
  const group = useRef();
  const turretRef = useRef();
  const barrelsRef = useRef(); 
  const radarRef = useRef();
  const cooldown = useRef(0);
  
  useEffect(() => {
      const id = `base_${team}`;
      registry.current[id] = {
          id, team, position: new THREE.Vector3(conf.pos, 2, 0), type: 'base', size: 6,
          damage: (amt) => {
              hp.current -= amt;
              onDamage(team, hp.current);
              if(group.current) {
                  group.current.position.x = conf.pos + (Math.random()-0.5)*0.5;
                  group.current.position.z = (Math.random()-0.5)*0.5;
                  setTimeout(()=> group.current && group.current.position.set(conf.pos, 0, 0), 50);
              }
              if (hp.current <= 0) onDeath();
          }
      };
      return () => delete registry.current[id];
  }, [team]);

  useFrame((state, delta) => {
      if (radarRef.current) radarRef.current.rotation.y += delta;
      if (barrelsRef.current) barrelsRef.current.position.z = THREE.MathUtils.lerp(barrelsRef.current.position.z, 2, delta * 5);

      if (hp.current <= 0) return;
      cooldown.current -= delta;
      
      if (cooldown.current <= 0) {
          const rangeSq = CONFIG.baseRange * CONFIG.baseRange;
          const nexusPos = new THREE.Vector3(conf.pos, 2, 0);
          
          const targets = Object.values(registry.current).filter(u => 
              u.team !== team && 
              u.position.distanceToSquared(nexusPos) < rangeSq
          );
          
          if (targets.length > 0) {
              const target = targets.reduce((prev, curr) => 
                  prev.position.distanceToSquared(nexusPos) < curr.position.distanceToSquared(nexusPos) ? prev : curr
              );
              
              if (turretRef.current) {
                  turretRef.current.lookAt(target.position.x, 2, target.position.z);
              }
              
              cooldown.current = 0.15; 
              if (barrelsRef.current) barrelsRef.current.position.z = 1.0;
              
              const offset = Math.random() > 0.5 ? 0.5 : -0.5; 
              const nozzlePos = new THREE.Vector3(offset, 0, 4).applyMatrix4(turretRef.current.matrixWorld);
              
              onFire('turret', nozzlePos, target.position.clone(), conf.color, 25, 0); 
          }
      }
  });

  const plateColor = '#333';
  const detailColor = '#555';

  return (
      <group ref={group} position={[conf.pos, 0, 0]}>
           <mesh geometry={baseGeo} receiveShadow position={[0, 1, 0]}>
              <meshStandardMaterial color={detailColor} roughness={0.3} metalness={0.8} />
           </mesh>
           
           <mesh position={[0, 3, 0]} castShadow receiveShadow>
               <boxGeometry args={[5, 3, 5]} />
               <meshStandardMaterial color={plateColor} roughness={0.2} metalness={0.6} />
           </mesh>
           
           <mesh position={[2.6, 3, 0]} castShadow><boxGeometry args={[0.5, 2.5, 4]} /><meshStandardMaterial color={conf.color} /></mesh>
           <mesh position={[-2.6, 3, 0]} castShadow><boxGeometry args={[0.5, 2.5, 4]} /><meshStandardMaterial color={conf.color} /></mesh>
           
           <mesh position={[0, 3, 2.51]}>
               <planeGeometry args={[3, 1]} />
               <meshBasicMaterial color={conf.color} toneMapped={false} />
           </mesh>

           <group position={[0, 5, -1.5]} ref={radarRef}>
               <mesh rotation={[0.5, 0, 0]}>
                   <cylinderGeometry args={[1.5, 0.1, 0.5, 8]} />
                   <meshStandardMaterial color="#888" side={THREE.DoubleSide} />
               </mesh>
               <mesh position={[0, 0.5, 0]}>
                   <cylinderGeometry args={[0.1, 0.1, 1]} />
                   <meshStandardMaterial color="#aaa" />
               </mesh>
           </group>

           <group position={[0, 5, 1]} ref={turretRef}>
                <mesh castShadow>
                    <boxGeometry args={[2, 1.5, 3]} />
                    <meshStandardMaterial color="#222" roughness={0.5} />
                </mesh>
                
                <group ref={barrelsRef} position={[0, 0, 2]}>
                    <mesh rotation={[Math.PI/2, 0, 0]} position={[0.5, 0, 0]} castShadow geometry={barrelGeo}>
                        <meshStandardMaterial color="#111" />
                    </mesh>
                    <mesh rotation={[Math.PI/2, 0, 0]} position={[-0.5, 0, 0]} castShadow geometry={barrelGeo}>
                        <meshStandardMaterial color="#111" />
                    </mesh>
                    <mesh position={[0.5, 0, 2]}>
                        <boxGeometry args={[0.4, 0.4, 0.1]} />
                        <meshBasicMaterial color={conf.color} />
                    </mesh>
                    <mesh position={[-0.5, 0, 2]}>
                        <boxGeometry args={[0.4, 0.4, 0.1]} />
                        <meshBasicMaterial color={conf.color} />
                    </mesh>
                </group>
           </group>

           <mesh rotation={[-Math.PI/2,0,0]} position={[0, 0.1, 0]}>
              <ringGeometry args={[CONFIG.baseRange-0.5, CONFIG.baseRange, 64]} />
              <meshBasicMaterial color={conf.color} opacity={0.15} transparent depthWrite={false} />
           </mesh>
           
           <Text position={[0, 8, 0]} fontSize={2} color="#fff" outlineWidth={0.1} outlineColor="#000" fontWeight="bold">
              {conf.name}
           </Text>
           <Text position={[0, 6.5, 0]} fontSize={1} color={hp.current < CONFIG.baseHp*0.3 ? 'red' : '#0f0'}>
              {hp.current > 0 ? hp.current.toFixed(0) : 'CRITICAL FAILURE'}
           </Text>
      </group>
  )
};
