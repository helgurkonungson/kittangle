import { utcDate } from '../core/levels';
import { ACCESSORIES, addPaws, GOLDEN, TROPHIES } from '../core/live';
import type { Reward } from '../core/retention';
import { rewardText } from '../core/retention';
import { migrate, SaveData } from '../core/save';
import { setLang, t } from '../i18n';
import type { IPlatform } from '../platform/IPlatform';
import { CrazyGamesPlatform } from '../platform/crazygames';
import { clearLocalSave, LocalPlatform } from '../platform/local';
import { setForcedMute, setMusicOff, setMuted } from './sfx';

// one build per portal: `vite build --mode crazygames` etc.
export const platform: IPlatform = import.meta.env.MODE === 'crazygames' ? new CrazyGamesPlatform() : new LocalPlatform();
export let save: SaveData = migrate(null);

export async function initState() {
  platform.onMute(setForcedMute);
  await platform.init();
  const q = new URLSearchParams(location.search);
  if (q.has('reset')) {
    clearLocalSave();
    // drop the flag so a later reload keeps the new progress
    q.delete('reset');
    history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + location.hash);
  }
  save = migrate(await platform.load());
  // dev helpers: ?level=37 jumps, ?fish=999 adds fish, ?lang=en
  if (q.get('level')) save.level = Math.max(1, Number(q.get('level')) || 1);
  if (q.get('fish')) save.fish = Number(q.get('fish')) || save.fish;
  // dev: ?cafe=full (or full1, full2 = variant) furnishes both rooms, adds 10 breeds and a guest (UI checks)
  const cv = /^full(\d)?$/.exec(q.get('cafe') ?? '');
  if (cv) {
    save.cafe = save.cafe.map((room) => room.map(() => Number(cv[1] ?? 0)));
    save.breeds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    save.visit.visitor = 9;
    save.visit.until = Date.now() + 3600e3;
  }
  setLang(q.get('lang') || platform.language());
  setMuted(save.muted);
  setMusicOff(save.musicOff);
  if (!save.tips.since) save.tips.since = Date.now();
}

export function persist() {
  void platform.save(save);
}

export function addFish(n: number) {
  save.fish = Math.max(0, save.fish + n);
  persist();
}

export function unlockBreed(b: number): boolean {
  if (save.breeds.includes(b)) return false;
  save.breeds.push(b);
  persist();
  return true;
}

/** Applies a reward; paws go through the weekly event track. Returns lines to show. */
export function grant(r: Reward): string[] {
  save.fish += r.fish ?? 0;
  save.stars += r.stars ?? 0;
  const out = r.paws ? grantPaws(r.paws) : [];
  persist();
  return out;
}

/** Adds event paws and pays out reached track steps, trophies, accessories and the season prize. */
export function grantPaws(n: number): string[] {
  const r = addPaws(save.event, save.season, utcDate(), n);
  const out: string[] = [];
  for (const st of r.steps) {
    if (st.reward) {
      save.fish += st.reward.fish ?? 0;
      save.stars += st.reward.stars ?? 0;
      out.push(t('eventStep', { r: rewardText(st.reward) }));
    }
    if (st.trophy) {
      const tr = TROPHIES[r.week];
      if (!save.trophies.includes(tr)) save.trophies.push(tr);
      out.push(t('gotTrophy', { name: t('trophy_' + tr) }));
    }
    if (st.accessory) {
      const a = ACCESSORIES[r.week];
      if (!save.accessories.includes(a)) save.accessories.push(a);
      out.push(t('gotAccessory', { name: t('acc_' + a) }));
    }
  }
  if (r.seasonComplete) {
    if (!save.breeds.includes(GOLDEN)) {
      save.breeds.push(GOLDEN);
      out.push(t('gotGolden'));
    } else {
      save.fish += 300;
      out.push(t('seasonBonus'));
    }
  }
  persist();
  return out;
}
