// 預熱：開場時先把每一種特效會用到的材質編譯好、粒子系統建好，第一次放招就不會卡一下。
import * as THREE from 'three';
import { emit, glowMat, solidMat } from './common.js';
import { energyMaterial, smoke, sparks, debris } from './realism.js';
import { makeFist, makeTitanArm, makeSword, makeCoin, std } from './models.js';
import { warmupObjects as dekuWarm } from './skills/cell0.js';
import { warmupObjects as conanWarm } from './skills/cell3.js';
import { warmupObjects as luffyWarm } from './skills/cell4.js';
import { warmupTextures as leaderTex } from './leaders.js';
import { warmupTextures as sukunaTex } from './sukuna.js';
import { warmupTextures as scorchTex } from './realism.js';

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
    new THREE.InstancedMesh(geo, glowMat('#ffffff'), 2), // 閃電用的 instanced 發光材質
    makeFist(std('#ffffff', { sheen: 1, clearcoat: 0.3, fade: true })),
    makeFist(),
    makeTitanArm(),
    makeSword(true),
    makeCoin(),
    // 各招自己共用、第一次用才建立的材質
    ...dekuWarm(), ...conanWarm(stage), ...luffyWarm(),
    // 結局、伏魔御廚子、焦痕用的畫布貼圖：登入動畫時先真的畫一次，上傳到顯示卡
    ...[...leaderTex(), ...sukunaTex(), ...scorchTex()].map(map => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }))),
  ];
  return objs;
}

/**
 * 靜音預演：每隔 0.6 秒在棋盤上放一招（兩個陣營輪流），讓顯示卡把第一次繪製的成本先付掉。
 * 只在畫面被全螢幕動畫蓋住時呼叫。回傳停止函式：清掉預演的棋子和特效、鏡頭回原位。
 */
export function rehearse(stage) {
  const silent = { sfx() {}, clip() {} };
  // 九招全部預演一次（盤面位置；特效最重的先），每招間隔 0.5 秒，整段約 4.5 秒，在登入動畫結束前跑完
  const plan = [[4, 'gojo'], [3, 'sukuna'], [5, 'gojo'], [0, 'sukuna'], [1, 'gojo'], [2, 'sukuna'], [6, 'gojo'], [7, 'sukuna'], [8, 'gojo']];
  let stopped = false;
  const timers = [];
  import('./skills/index.js').then(({ SKILLS, makeFx }) => import('./common.js').then(({ palette }) => import('../core/worlds.js').then(({ WORLDS }) => {
    plan.forEach(([cell, faction], i) => {
      timers.push(setTimeout(() => {
        if (stopped) return;
        try { SKILLS[cell](makeFx({ stage, cell, faction, tier: 'key', audio: silent, world: WORLDS[cell], pal: palette(faction) })); } catch (e) { console.warn('rehearse', e); }
      }, i * 500));
    });
  })));
  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
    stage.clearBoard();
    stage.resetView();
  };
}
