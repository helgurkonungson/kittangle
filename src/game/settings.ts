import Phaser from 'phaser';
import { t } from '../i18n';
import { setMuted, setMusicOff } from './sfx';
import { persist, save } from './state';
import { C, modal } from './ui';

/** Sound / music toggles (+ feedback where the scene offers it); reopens itself after a toggle. */
export function openSettings(s: Phaser.Scene, feedback?: () => void) {
  const again = () => openSettings(s, feedback);
  const close = modal(s, t('settings'), [], [
    { label: `${t('sound')}: ${t(save.muted ? 'off' : 'on')}`, color: C.panel, onClick: () => { save.muted = !save.muted; setMuted(save.muted); persist(); close(); again(); } },
    { label: `${t('music')}: ${t(save.musicOff ? 'off' : 'on')}`, color: C.panel, onClick: () => { save.musicOff = !save.musicOff; setMusicOff(save.musicOff); persist(); close(); again(); } },
    ...(feedback ? [{ label: t('sendFeedback'), color: C.blue, onClick: () => { close(); feedback(); } }] : []),
  ], true);
}
