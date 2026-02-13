import React, { useMemo } from 'react';
import { CONFIG, UNITS, UPGRADES } from '../../config/constants';

// Format seconds to MM:SS
const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const GameUI = ({ gameState, money, baseHp, scores, gameTime, onStart, onSpawn, onUpgrade, onSkill, onToggleAuto, autoMode, skillReady, upgrades, unitCounts }) => {
  if (gameState === 'menu') {
    return (
      <div className="ui-overlay menu">
        <h1 className="title">STAR WARFARE</h1>
        <div className="menu-controls">
           <button className="btn-primary" onClick={() => onStart(false)}>COMMANDER</button>
           <button className="btn-secondary" onClick={() => onStart(true)}>AUTO SIM</button>
        </div>
        <p className="subtitle">PLANETARY CONQUEST</p>
      </div>
    );
  }

  if (gameState === 'ended') {
    return (
      <div className="ui-overlay ended">
        <h1 style={{ color: scores.winner === 'blue' ? CONFIG.blue.color : CONFIG.red.color }}>
          {scores.winner === 'blue' ? 'VICTORY' : 'DEFEAT'}
        </h1>
        <p>DURATION: {formatTime(gameTime)}</p>
        <button className="btn-primary" onClick={() => onStart(false)}>PLAY AGAIN</button>
      </div>
    );
  }

  return (
    <div className="ui-overlay hud">
      <div className="top-bar">
        <div className="team-score red">
           <div className="bar-bg"><div className="bar-fill" style={{ width: `${(baseHp.red/CONFIG.baseHp)*100}%`, background: CONFIG.red.color }}></div></div>
           <div style={{display:'flex', justifyContent:'space-between'}}>
               <span style={{color:CONFIG.red.color}}>{CONFIG.red.name}</span>
               <span style={{color:'#888', fontSize:'0.8rem'}}>UNITS: {unitCounts ? unitCounts.red : 0}</span>
           </div>
        </div>
        
        {/* TIMER & AUTO TOGGLE */}
        <div className="vs-container">
            <div className="timer">{formatTime(gameTime)}</div>
            <button className={`btn-auto ${autoMode ? 'active' : ''}`} onClick={onToggleAuto}>
               {autoMode ? 'AUTO' : 'MANUAL'}
            </button>
        </div>
        
        <div className="team-score blue">
           <div style={{display:'flex', justifyContent:'space-between'}}>
               <span style={{color:CONFIG.blue.color}}>{CONFIG.blue.name}</span>
               <span style={{color:'#888', fontSize:'0.8rem'}}>UNITS: {unitCounts ? unitCounts.blue : 0}</span>
           </div>
           <div className="bar-bg"><div className="bar-fill" style={{ width: `${(baseHp.blue/CONFIG.baseHp)*100}%`, background: CONFIG.blue.color, marginLeft: 'auto' }}></div></div>
        </div>
      </div>

      <div className={`bottom-bar ${autoMode ? 'disabled-panel' : ''}`}>
        <div className="panel resource-panel">
           <div className="label">MINERALS</div>
           <div className="value">{Math.floor(money)}</div>
        </div>

        <div className="panel unit-deck">
           {Object.entries(UNITS).map(([key, u]) => (
             <button key={key} className={`card ${money >= u.cost ? '' : 'disabled'}`} onClick={() => onSpawn(key)}>
                <div className="name">{u.name}</div>
                <div className="cost">{u.cost}</div>
                <div className="type-icon">{key === 'artillery' ? '🛡️' : (key==='tank'?'🚜' : key==='ghost'?'👻' : key==='flamebat'?'🔥' : '🔫')}</div>
             </button>
           ))}
        </div>

        <div className="panel tech-deck">
            {UPGRADES.map(up => {
                const lvl = upgrades[up.id] || 0;
                const cost = Math.floor(up.cost * Math.pow(1.5, lvl));
                return (
                    <button key={up.id} className={`card tech ${money >= cost ? '' : 'disabled'}`} onClick={() => onUpgrade(up.id, cost)}>
                        <div className="name">{up.name} <span style={{color:'#00bcd4'}}>Lv.{lvl}</span></div>
                        <div className="cost">{cost}</div>
                    </button>
                )
            })}
        </div>

        <div className="panel skill-deck">
             <button className={`card skill ${money >= CONFIG.skill.cost && skillReady ? '' : 'disabled'}`} onClick={onSkill}>
                <div className="name">NUKE</div>
                <div className="cost">{CONFIG.skill.cost}</div>
                <div className="status">{skillReady ? 'READY' : 'WAIT'}</div>
             </button>
        </div>

      </div>
    </div>
  );
};
