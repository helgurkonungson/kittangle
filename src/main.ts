import Phaser from 'phaser';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import { CafeScene } from './game/CafeScene';
import { PreloadScene } from './game/art';
import { CollectionScene } from './game/CollectionScene';
import { EventScene } from './game/EventScene';
import { LevelScene } from './game/LevelScene';
import { MapScene } from './game/MapScene';
import { initState } from './game/state';
import { C, H, W } from './game/ui';

// Phaser text needs the webfont ready before the first frame (falls back to system fonts offline or for CJK)
const fonts = Promise.race([
  Promise.all(['800 32px Nunito', '900 32px Nunito'].map((f) => document.fonts.load(f, 'Aa Яя'))),
  new Promise((r) => setTimeout(r, 1500)),
]).catch(() => undefined);

Promise.all([initState(), fonts]).then(() => {
  (window as unknown as { __game: Phaser.Game }).__game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: W,
    height: H,
    backgroundColor: C.bg,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [PreloadScene, MapScene, LevelScene, CafeScene, CollectionScene, EventScene],
  });
});
