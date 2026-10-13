import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NameTags } from '../src/visuals/NameTags.js';

function container() {
  const children = [];
  const doc = {
    createElement() {
      const el = { style: {}, dataset: {}, textContent: '', remove() { children.splice(children.indexOf(el), 1); } };
      return el;
    },
  };
  return { children, ownerDocument: doc, append(el) { children.push(el); } };
}

test('tags follow cars on screen, hide behind the camera, and update or disappear with the roster', () => {
  const box = container();
  const tags = new NameTags(box);
  tags.set([{ id: 'orange-1', text: 'Ali', team: 'orange' }, { id: 'blue-2', text: 'BOT', team: 'blue' }]);
  assert.equal(box.children.length, 2);
  const camera = new THREE.PerspectiveCamera(70, 2, 0.1, 500);
  camera.position.set(0, 2, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const ahead = new THREE.Object3D(); ahead.position.set(0, 0, 0);
  const behind = new THREE.Object3D(); behind.position.set(0, 0, 30);
  tags.update(camera, new Map([['orange-1', ahead], ['blue-2', behind]]), 1000, 500);
  const [ali, bot] = box.children;
  assert.equal(ali.textContent, 'Ali');
  assert.equal(ali.dataset.team, 'orange');
  assert.equal(ali.style.display, '');
  const [, x, y] = /translate\(([\d.]+)px, ([\d.]+)px\)/.exec(ali.style.transform).map(Number);
  assert.ok(Math.abs(x - 500) < 1, 'centred horizontally');
  assert.ok(y < 250, 'above the car (screen centre is 250)');
  assert.equal(bot.style.display, 'none', 'behind the camera');

  tags.set([{ id: 'orange-1', text: 'Ali K.', team: 'orange' }]);
  assert.equal(box.children.length, 1);
  assert.equal(box.children[0].textContent, 'Ali K.');
  tags.clear();
  assert.equal(box.children.length, 0);
});
