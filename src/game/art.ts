import Phaser from 'phaser';
import { BREEDS } from '../core/content';
import { drawCat, type Mood } from './drawCat';
import { bakeIcons } from './icons';
import { DEV, platform, save } from './state';
import { fitCamera } from './ui';

const BASE = `${import.meta.env.BASE_URL}art/`;
/** Art for content that is not in the game yet (update 1 nursery/kittens/new breeds, update 2 winter house/yarn):
 *  imported and shipped in public/art, but not loaded until its feature is wired (first-load budget < 5 MB). */
const LATER = /^(kitten_|decor_r[34]_|yarn_|resident_(mila|pryazhka)|icon_(bond|yarn|key|fish_token|fb_|feedback|share|new_cat|preview|pause|flag)|(head|tail|portrait)_(scottish|tuxedo)|cafe_room[34]$|map_|ob_|cat_bed|bg_menu|chapter[12]_cover)/;

/** Loads generated art listed in public/art/manifest.json ({ key: "folder/file.png" }); none is fine. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    this.load.json('art_manifest', BASE + 'manifest.json?v=' + __BUILD__);
  }

  create() {
    fitCamera(this);
    bakeIcons(this);
    const m = (this.cache.json.get('art_manifest') ?? {}) as Record<string, string>;
    const keys = Object.keys(m).filter((k) => !LATER.test(k));
    // first run: straight into level 1, no title screen (GDD 2.0 §4); later the chapter map
    const go = () => {
      platform.ready();
      const dev = DEV ? Number(new URLSearchParams(location.search).get('play')) : 0; // dev: ?play=14 opens a level
      if (dev > 0) this.scene.start('Level', { mode: 'level', n: dev });
      else if (save.level === 1 && !save.best[1]) this.scene.start('Level', { mode: 'level', n: 1 });
      else this.scene.start('Title');
    };
    if (!keys.length) return go();
    for (const k of keys) this.load.image(k, BASE + m[k] + '?v=' + __BUILD__);
    this.load.once('complete', go);
    this.load.start();
  }
}

export const has = (s: Phaser.Scene, key: string) => s.textures.exists(key);

/** Image fitted into a box (contain) or covering it; null when the art is not generated yet. */
export function art(s: Phaser.Scene, key: string, x: number, y: number, w: number, h: number, cover = false) {
  if (!has(s, key)) return null;
  const im = s.add.image(x, y, key);
  const k = cover ? Math.max(w / im.width, h / im.height) : Math.min(w / im.width, h / im.height);
  return im.setScale(k);
}

export const HEAD_MOOD: Record<string, string> = { calm: 'calm', happy: 'happy', angry: 'offended', sleep: 'sleep' };

/** Texture key of a generated head. Until the S23 sleeping heads exist, a sleeping cat uses the
 * happy head (its eyes are closed arcs), never an open-eyed one. */
export function headKey(s: Phaser.Scene, breedKey: string, mood: string) {
  const k = `head_${breedKey}_${HEAD_MOOD[mood] ?? 'calm'}`;
  return mood === 'sleep' && !has(s, k) ? `head_${breedKey}_happy` : k;
}
export const SPEAKER_ART: Record<string, string> = {
  murr: 'mentor_murr_calm', bun: 'resident_bun_calm', luna: 'resident_luna_calm',
};

/**
 * Stretchy cat with the generated head (body stays procedural, like on the board).
 * Returns a container so callers can tween it; falls back to the fully procedural cat.
 */
export function artCat(s: Phaser.Scene, pts: { x: number; y: number }[], breed: number, size: number, mood: Mood) {
  const c = s.add.container(0, 0);
  const g = s.add.graphics();
  const key = headKey(s, BREEDS[breed].key, mood);
  const useArt = has(s, key);
  drawCat(g, pts, breed, size, mood, false, undefined, useArt);
  c.add(g);
  if (useArt) {
    const rot = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x) + Math.PI / 2;
    c.add(s.add.image(pts[0].x, pts[0].y, key).setDisplaySize(size * 1.05, size * 1.05).setRotation(rot));
  }
  return c;
}

/** Sitting full-body cat (album portrait art); procedural fallback. */
export function sittingCat(s: Phaser.Scene, breed: number, x: number, y: number, size: number) {
  const im = art(s, `portrait_${BREEDS[breed].key}`, x, y, size, size);
  if (im) return im;
  const g = s.add.graphics();
  drawCat(g, [{ x: x + size * 0.2, y }, { x: x - size * 0.2, y }], breed, size * 0.5, 'happy');
  return g;
}
