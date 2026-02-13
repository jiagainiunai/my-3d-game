import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CONFIG, UNITS } from '../../config/constants';

export const GameManager = ({ gameState, setMoney, skillReady, setSkillReady, skillCdTimer, aiTimer, spawnUnit, autoMode, money, handleUpgrade, setGameTime }) => {
  // AI State
  const redMoney = useRef(CONFIG.startMoney);
  const aiTimerRef = useRef(0); 
  const gameTimeRef = useRef(0);
  
  // Track internal money to avoid dependency on prop 'money' for logic (which might lag)
  // But we need to sync with App state for UI. 
  // Let's rely on props for now but optimize the update logic.

  useFrame((_, delta) => {
      if (gameState !== 'playing') return;

      // 1. GLOBAL ECONOMY & TIME
      gameTimeRef.current += delta;
      const gameTime = gameTimeRef.current;
      
      // Sync UI Time every 1s
      if (Math.floor(gameTime) > Math.floor(gameTime - delta)) {
          setGameTime(gameTime);
      }

      // --- HYPER ECONOMY SCALING (Exponential) ---
      // Base: 40
      // 1 min: 40 + 60^1.5 * 0.05 = ~60
      // 3 min: 40 + 180^1.5 * 0.05 = ~160
      // 5 min: 40 + 300^1.5 * 0.05 = ~300 per tick (frame!) -> ~18,000 per second!
      // Wait, 18k/sec is INSANE. Let's tune it.
      // Goal: 5 mins -> 3000/sec.
      // At 60fps, that's 50/frame.
      
      const timeSec = gameTime;
      // Exponential curve: starts slow, explodes after 3 mins
      const scaleFactor = 1 + (timeSec * timeSec) / 20000; 
      // Base 40 * scale. 
      // At 300s (5min): 300*300/20000 = 4.5. Scale = 5.5. Income = 220/sec. Still low?
      // User wants 3000/sec.
      
      // Let's use explicit stages
      let incomePerSec = 100; // Start
      if (timeSec > 60) incomePerSec = 300;
      if (timeSec > 120) incomePerSec = 800;
      if (timeSec > 180) incomePerSec = 1500;
      if (timeSec > 240) incomePerSec = 3000; // 4 mins -> 3000/sec
      if (timeSec > 300) incomePerSec = 5000; // 5 mins -> 5000/sec!

      const frameIncome = incomePerSec * delta;

      setMoney(m => Math.min(m + frameIncome, 999999));
      redMoney.current = Math.min(redMoney.current + frameIncome, 999999);
         
      if (!skillReady) {
         skillCdTimer.current -= delta;
         if (skillCdTimer.current <= 0) setSkillReady(true);
      }

      // --- DYNAMIC AI PROBABILITY (Tech Up) ---
      // Force heavy units later
      const pickUnit = () => {
          const r = Math.random();
          // After 2 mins, 0% chance for Marine from AI
          if (timeSec > 120) {
              if (r > 0.6) return 'artillery';
              if (r > 0.2) return 'tank';
              return 'ghost';
          }
          // After 4 mins, Mostly Artillery
          if (timeSec > 240) {
              if (r > 0.3) return 'artillery';
              return 'tank';
          }
          
          // Early game mix
          if (r > 0.8) return 'tank';
          return 'ranger';
      };

      // 2. RED AI (Enemy) - Swarm Mode
      aiTimerRef.current += delta;
      // Think faster as game progresses
      const thinkTime = Math.max(0.1, 1.0 - timeSec / 300); 
      
      if (aiTimerRef.current > thinkTime) { 
          aiTimerRef.current = 0;
          
          // Spend ALL money
          // Cap loop to prevent freeze if money is infinite
          let loopGuard = 0;
          while (redMoney.current > 200 && loopGuard < 10) {
              const type = pickUnit();
              const cost = UNITS[type].cost;
              if (redMoney.current >= cost) {
                  redMoney.current -= cost;
                  spawnUnit('red', type);
              }
              loopGuard++;
          }
      }

      // 3. BLUE AI (Auto Mode)
      if (autoMode) {
          // Check frequently
          if (Math.random() < 0.2) { 
              // Try to buy expensive stuff first
              const type = pickUnit();
              const cost = UNITS[type].cost;
              
              if (money >= cost) {
                  setMoney(m => m - cost);
                  spawnUnit('blue', type);
              }

              // Auto Upgrade if super rich
              if (money > 5000) {
                  handleUpgrade('atk', 800);
                  handleUpgrade('hp', 800);
              }
          }
      }
  });
  
  return null;
};
