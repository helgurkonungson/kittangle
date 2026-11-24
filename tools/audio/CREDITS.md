# Audio credits

Audio set v2 (Mac folder `audio2/`, imported 2026-11-23, GDD 2.0 "bright arcade-pop" identity).

- Sound effects (28 files): Stability AI Stable Audio 3 Small SFX, open weights, run locally (MLX on Apple Silicon),
  prompts in `audio2/Kittangle_Audio_Prompts_Complete_v1.2.md`. Stability AI Community License: commercial use is
  free below USD 1M annual revenue, registration at stability.ai/community-license required.
  Per-file model, seed and date: `Sound/PROVENANCE.csv` on the Mac.
- Music (4 loops: menu/map, puzzle, café, daily): Stable Audio open model (same Stability AI Community License),
  prompts M01–M04 in the same file (user confirmed 2026-11-23).
- Cat meow fallback: synthesized in code (`src/game/sfx.ts`), used only if the files fail to load.

Game file names (`public/audio/`): ui_button_tap → ui_click, cat_stretch_slide → slide, cat_exit_meow_0N → meow_N,
puzzle_cat_exit_pop → pop, cat_purr_short → purr, cat_purr_loop → purrloop, cat_offended_huff_0N → huff_N,
puzzle_blocked_bonk → bonk, scratchy_* → scratchy_warn/swipe/smug, cat_sleepy_wakeup → wake, puzzle_hint_reveal → hint,
puzzle_path_preview → preview, puzzle_kitten_unlocked → kitten, puzzle_box_bump → box, ui_level_node_select → node,
ui_level_unlocked → unlock, reward_fish_collect → coin, reward_paw_medal → star, reward_chapter_complete → chapter,
cafe_decoration_place → task, daily_complete → daily, map_transition → scene, music_*_loop → music_menu/level/cafe/daily.
Conversion: SFX trimmed, loudness-normalized to −16 LUFS, mono MP3 80 kbps; music crossfaded (`loop.py`, 2 s),
−20 LUFS, stereo MP3 64 kbps. Music is fetched and decoded only when its scene plays.

Update 2026-11-24 (Mac `audio2/`, now archived): new music_menu, music_cafe, meow_1…meow_6 and purr (purrloop = full
purr, purr = first 2.2 s with a fade). Source per the user: same Stable Audio open model and license as above.
