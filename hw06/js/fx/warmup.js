// 預熱：開場時先把每一種特效會用到的材質編譯好、粒子系統建好，第一次放招就不會卡一下。
import * as THREE from 'three';
import { emit, glowMat, solidMat } from './common.js';
import { energyMaterial, smoke, sparks, debris } from './realism.js';
import { makeFist, makeTitanArm, makeSword, makeCoin, std } from './models.js';

export function fxWarmupObjects(stage) {
  // 粒子、煙、火花、碎石系統第一次使用時才會建立（加進場景），先各發一顆在畫面外
  const away = new THREE.Vector3(0, -400, 0);
  emit(stage, { pos: away, count: 3, life: 0.05 });
  smoke(stage, away, { count: 2, life: 0.05 });
  sparks(stage, away, { count: 2, life: 0.05 });
  debris(stage, away, { count: 2, life: 0.05 });

  const geo = new THREE.PlaneGeometry(1, 1);
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.needsUpdate = true;
  const objs = [
    new THREE.Mesh(geo, energyMaterial(stage, {})),
    new THREE.Mesh(geo, glowMat('#ffffff')),
    new THREE.Mesh(geo, solidMat('#ffffff')),
    new THREE.Mesh(geo, solidMat('#ffffff', { opacity: 0.5 })),
    new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })),
    new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false })),
    new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, side: THREE.DoubleSide, depthWrite: false })),
    new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
    new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })),
    makeFist(std('#ffffff', { sheen: 1, clearcoat: 0.3, fade: true })),
    makeFist(),
    makeTitanArm(),
    makeSword(true),
    makeCoin(),
  ];
  return objs;
}

/**
 * 靜音預演：每隔 0.6 秒在棋盤上放一招（兩個陣營輪流），讓顯示卡把第一次繪製的成本先付掉。
 * 只在畫面被全螢幕動畫蓋住時呼叫。回傳停止函式：清掉預演的棋子和特效、鏡頭回原位。
 */
export function rehearse(stage) {
  const silent = { sfx() {}, clip() {} };
  const plan = [[4, 'gojo'], [7, 'sukuna'], [0, 'gojo'], [5, 'sukuna'], [2, 'gojo'], [8, 'sukuna']];
  let stopped = false;
  const timers = [];
  import('./skills/index.js').then(({ SKILLS, makeFx }) => import('./common.js').then(({ palette }) => import('../core/worlds.js').then(({ WORLDS }) => {
    plan.forEach(([cell, faction], i) => {
      timers.push(setTimeout(() => {
        if (stopped) return;
        try { SKILLS[cell](makeFx({ stage, cell, faction, tier: 'key', audio: silent, world: WORLDS[cell], pal: palette(faction) })); } catch (e) { console.warn('rehearse', e); }
      }, i * 600));
    });
  })));
  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
    stage.clearBoard();
    stage.resetView();
  };
}
