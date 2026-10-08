> **TARİHSEL VE ARŞİV NOTU (2026-10-08)**:
> Bu belge projenin geçmiş geliştirme aşamasına ait tarihsel bir kayıttır.
> Belgede yer alan "henüz tarayıcıda açılamıyor" iddiası **güncel sürüm için geçerli değildir**.
> Tarayıcı giriş noktaları (`index.html`, `online.html`), 3D işleyici, online WebSocket 1v1 sunucusu,
> istemci tahmin motoru ve tüm test entegrasyonları tamamlanmış ve aktif duruma getirilmiştir.
> Güncel durum için `README.md` ve `docs/STATUS_AND_TESTS.md` belgelerini inceleyiniz.

---

# Rocket Arena 3D — ara sürüm (yarım)

Bu paket geliştirmenin **yarım kalmış ara halidir**. Fizik, maç kuralları ve bot gerçek testlerle
doğrulandı; ancak oyun **henüz tarayıcıda açılamıyor**. Giriş noktası (`index.html`, `src/main.js`,
`src/App.js`), HUD, menüler ve CSS henüz yazılmadı. Bu yüzden `npm run dev` ve `npm run build`
şimdilik çalışmaz.

## Şu an çalıştırılabilen: testler

Gereksinim: Node.js 20.19+ veya 22 LTS.

```bash
npm install
npm test
```

Testler tarayıcı olmadan, gerçek Rapier fizik motoruyla simülasyonu tick tick koşturur.

## Son test çalıştırması (2026-10-08)

Sonuç: **28 geçti, 0 kaldı.**

- ✔ arena collision mesh is watertight (3000 random rays all hit)
- ✔ visual meshes are built from exactly the collision surface
- ✔ boost pads and kickoff spots lie on the flat floor
- ✔ bot vs idle opponent: the bot touches the ball and scores
- ✔ bot vs bot: 3 simulated minutes, both bots play, no numerical problems
- ✔ fixed-step accumulator
- ✔ piecewise-linear curves
- ✔ car settles on four wheels at the rest height
- ✔ throttle accelerates to ~14 m/s and the car stays upright and straight
- ✔ boost accelerates to the 23 m/s cap and drains 33.3 per second
- ✔ steering right turns the car clockwise (towards +X)
- ✔ powerslide (handbrake) reduces lateral grip
- ✔ single jump reaches a RL-like height and lands
- ✔ double jump goes higher than a single jump
- ✔ forward dodge adds ~5 m/s and flips the car
- ✔ air roll spins the car around its forward axis
- ✔ car drives from the floor up onto the side wall
- ✔ upside-down car recovers with a jump
- ✔ ball bounces with ~0.6 restitution
- ✔ ball at max speed never tunnels through walls, corners or ceiling
- ✔ a car hit launches the ball forward, faster than the car
- ✔ countdown blocks input; the clock starts on the first touch
- ✔ goal counts only after the whole ball crosses the line, then kickoff resets
- ✔ ball hitting the post is not a goal
- ✔ tie at 0:00 -> golden goal overtime; overtime goal ends the match
- ✔ zero-second rule: the match ends when the airborne ball lands
- ✔ boost pads refill and respawn
- ✔ training: a goal is counted and the ball respawns

Bot ölçümleri:

- bot vs idle (120 s): touches=14 goals=4 ownGoals=0
- bot vs bot (180 s): score {"blue":0,"orange":4} touches {"blue":17,"orange":28} warnings=0

## Klasörler

| Klasör | İçerik | Durum |
|---|---|---|
| `src/config/` | Tüm ayarlar; fizik parametrelerinin tamamı `physics.js` içinde | Testlerde kullanılıyor |
| `src/core/` | Matematik yardımcıları, EventBus, sabit adımlı döngü (120 Hz, render interpolasyonu) | Adım hesabı test edildi |
| `src/physics/` | Rapier sarmalayıcı, özel araç kontrolcüsü, top, araç-top vuruş impulsu | Test edildi |
| `src/arena/` | Prosedürel arena geometrisi (çarpışma ve görsel mesh aynı kaynaktan), collider'lar, yerleşim | Test edildi |
| `src/game/` | Tarayıcıdan bağımsız `Simulation`, maç kuralları, boost pad sistemi | Test edildi |
| `src/ai/` | Bot ve top tahmini | Test edildi |
| `src/input/`, `src/camera/`, `src/visuals/`, `src/ui/Settings.js` | Klavye/gamepad, kameralar, 3D görseller | **Yazıldı, henüz derlenmedi ve çalıştırılmadı** |
| `tests/` | `node:test` testleri | — |

## Koordinat sistemi ve arayüzler (yeni modül yazacaklar için)

- 1 birim = 1 metre, +Y yukarı, sağ el koordinat sistemi, fizik 120 Hz.
- Saha Z ekseni boyunca: **mavi kale +Z**, turuncu kale −Z. Mavi takım −Z yönüne hücum eder.
- Araç yerel ekseni: +X sağ, +Y üst, **−Z ileri**.
- `ControlState`: `throttle, steer, pitch, yaw, roll` (−1..1; pitch +1 = burun aşağı) ve
  `jump, boost, handbrake` (boolean). Tanım: `src/physics/CarController.js`.
- Bot arayüzü: `update(gameState, dt) → ControlState`; `gameState` formatı `Simulation.getState()`.
  Botlar fizik gövdesine dokunmaz, yalnızca girdi üretir.
- Olaylar (`sim.events`): `goal`, `ballHit`, `boostPickup`, `countdown`, `kickoff`, `overtime`,
  `timeUp`, `matchEnd`, `phase`, `jump`, `doubleJump`, `dodge`, `recover`, `warning`.

## Eksikler

- HUD, ana menü, duraklatma, ayarlar ve maç sonu ekranları
- `src/App.js`, `src/main.js`, `index.html`, CSS, `vite.config.js`
- Production build ve tarayıcıda smoke test
- `docs/ARCHITECTURE.md`, `docs/INTERFACES.md`, `docs/TUNING.md`

## Bilinen notlar

- Bot-bot maçlarında skor bir takım lehine kayabiliyor; simetrik kickoff'ların hep aynı tarafa
  sonuçlanması olası neden, henüz incelenmedi.
- macOS'ta Ctrl+Space giriş kaynağı değiştirme kısayolu olabilir; powerslide basılıyken zıplamayı
  engelleyebilir. Gerekirse Sistem Ayarları > Klavye > Klavye Kısayolları > Giriş Kaynakları'ndan kapatın.
