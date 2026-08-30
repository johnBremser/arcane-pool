const AudioSys = (() => {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = true;
  let ambientEnabled = false;
  let ambientBus = null;
  let ambientTimer = null;
  let ambientStep = 0;
  let lastNotificationAt = -Infinity;
  const AMBIENT_TEMPO = 128;
  const AMBIENT_STEP_SECONDS = 60 / AMBIENT_TEMPO / 4;
  const AMBIENT_LOOP_MS = AMBIENT_STEP_SECONDS * 16 * 1000;

  function ensure() {
    if (!ctx) {
      try {
        const AudioContextClass =
          window.AudioContext || window.webkitAudioContext;

        ctx = new AudioContextClass();
        master = ctx.createGain();
        master.gain.value = 0.62;
        master.connect(ctx.destination);
        createNoiseBuffer();
      } catch (err) {
        enabled = false;
      }
    }

    if (ctx && ctx.state === "suspended") {
      ctx.resume();
    }

    return Boolean(ctx);
  }

  function setEnabled(nextEnabled) {
    if (!nextEnabled) {
      enabled = false;
      return false;
    }

    enabled = ensure();
    return enabled;
  }

  function createNoiseBuffer() {
    const length = ctx.sampleRate;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function playTone(options) {
    const {
      freq = 440,
      end = null,
      type = "sine",
      duration = 0.1,
      gain = 0.2,
      delay = 0,
      attack = 0,
      output = master
    } = options;

    if (!ctx || (!enabled && output !== ambientBus)) return;

    const t = now() + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    if (end !== null && end !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
    }

    if (attack > 0) {
      amp.gain.setValueAtTime(0.001, t);
      amp.gain.exponentialRampToValueAtTime(gain, t + Math.min(attack, duration * 0.6));
    } else {
      amp.gain.setValueAtTime(gain, t);
    }
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(amp);
    amp.connect(output);

    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  function playNoise(options) {
    const {
      duration = 0.08,
      gain = 0.18,
      frequency = 1200,
      q = 1,
      type = "lowpass",
      delay = 0,
      attack = 0,
      output = master
    } = options;

    if (!ctx || !noiseBuffer || (!enabled && output !== ambientBus)) return;

    const t = now() + delay;

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, t);
    filter.Q.value = q;

    const amp = ctx.createGain();
    if (attack > 0) {
      amp.gain.setValueAtTime(0.001, t);
      amp.gain.exponentialRampToValueAtTime(
        gain,
        t + Math.min(attack, duration * 0.55)
      );
    } else {
      amp.gain.setValueAtTime(gain, t);
    }
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(amp);
    amp.connect(output);

    source.start(t);
    source.stop(t + duration + 0.03);
  }

  function playAmbientPhrase() {
    if (!ambientEnabled || !ambientBus) return;

    // Groove arcade em semicolcheias: baixo sincopado, bateria marcada,
    // acordes curtos e melodia ascendente para manter energia sem virar ruído.
    const roots = [261.63, 349.23, 392, 293.66];
    const root = roots[ambientStep % roots.length];
    ambientStep += 1;

    const melodySteps = [0, 2, 5, 7, 8, 10, 13, 15];
    const melodyRatios = [1, 1.2599, 1.4983, 2, 1.4983, 2, 2.5198, 2];
    melodySteps.forEach((step, index) => {
      playTone({
        freq: root * melodyRatios[index],
        end: root * melodyRatios[index] * 1.018,
        type: index % 3 === 0 ? "square" : "triangle",
        duration: AMBIENT_STEP_SECONDS * 1.45,
        gain: index % 3 === 0 ? 0.028 : 0.036,
        delay: step * AMBIENT_STEP_SECONDS,
        attack: 0.008,
        output: ambientBus
      });
    });

    const bassSteps = [0, 3, 6, 8, 11, 14];
    const bassRatios = [0.5, 0.75, 0.5, 1, 0.75, 1];
    bassSteps.forEach((step, index) => {
      playTone({
        freq: root * bassRatios[index],
        end: root * bassRatios[index] * 0.96,
        type: index % 2 === 0 ? "sawtooth" : "triangle",
        duration: AMBIENT_STEP_SECONDS * 1.65,
        gain: 0.052,
        delay: step * AMBIENT_STEP_SECONDS,
        attack: 0.006,
        output: ambientBus
      });
    });

    [0, 4, 8, 12].forEach((step) => {
      playTone({
        freq: 128,
        end: 46,
        type: "sine",
        duration: 0.115,
        gain: step === 0 ? 0.09 : 0.07,
        delay: step * AMBIENT_STEP_SECONDS,
        output: ambientBus
      });
    });

    [4, 12].forEach((step) => {
      playNoise({
        duration: 0.105,
        gain: 0.045,
        frequency: 1850,
        q: 1.1,
        type: "bandpass",
        delay: step * AMBIENT_STEP_SECONDS,
        output: ambientBus
      });
    });

    [2, 6, 10, 14].forEach((step) => {
      playNoise({
        duration: step === 14 ? 0.08 : 0.035,
        gain: step === 14 ? 0.025 : 0.017,
        frequency: 5200,
        q: 0.7,
        type: "highpass",
        delay: step * AMBIENT_STEP_SECONDS,
        output: ambientBus
      });
    });

    [0, 8].forEach((step) => {
      [1, 1.2599, 1.4983].forEach((ratio, index) => {
        playTone({
          freq: root * ratio,
          end: root * ratio * 1.006,
          type: "triangle",
          duration: AMBIENT_STEP_SECONDS * 2.2,
          gain: 0.018 - index * 0.003,
          delay: step * AMBIENT_STEP_SECONDS,
          attack: 0.01,
          output: ambientBus
        });
      });
    });
  }

  function setAmbient(nextEnabled) {
    if (!nextEnabled) {
      ambientEnabled = false;
      clearInterval(ambientTimer);
      ambientTimer = null;
      if (ambientBus && ctx) {
        const bus = ambientBus;
        ambientBus = null;
        bus.gain.cancelScheduledValues(now());
        bus.gain.setValueAtTime(Math.max(0.001, bus.gain.value), now());
        bus.gain.exponentialRampToValueAtTime(0.001, now() + 0.7);
        setTimeout(() => bus.disconnect(), 800);
      }
      return false;
    }

    if (!ensure()) return false;
    if (ambientEnabled) return true;

    ambientEnabled = true;
    ambientStep = 0;
    ambientBus = ctx.createGain();
    ambientBus.gain.setValueAtTime(0.001, now());
    ambientBus.gain.exponentialRampToValueAtTime(0.96, now() + 0.55);
    ambientBus.connect(master);
    playAmbientPhrase();
    ambientTimer = setInterval(playAmbientPhrase, AMBIENT_LOOP_MS);
    return true;
  }

  function playBallReturn(kind = "object") {
    // Simula a bola passando pelo duto interno e chegando à gaveta.
    playNoise({
      duration: 0.78,
      gain: 0.032,
      frequency: 310,
      q: 1.2,
      type: "lowpass",
      delay: 0.2,
      attack: 0.1
    });

    [0.3, 0.41, 0.53, 0.66, 0.79, 0.9].forEach((delay, index) => {
      playTone({
        freq: 145 + index * 7,
        end: 82,
        type: "triangle",
        duration: 0.045,
        gain: 0.028 - index * 0.002,
        delay
      });
    });

    playNoise({
      duration: 0.075,
      gain: 0.052,
      frequency: 520,
      q: 0.9,
      type: "lowpass",
      delay: 1.02
    });
    playTone({
      freq: 210,
      end: 92,
      type: "triangle",
      duration: 0.14,
      gain: 0.065,
      delay: 1.02
    });

    if (kind === "magic") {
      playTone({
        freq: 980,
        end: 1320,
        type: "sine",
        duration: 0.12,
        gain: 0.022,
        delay: 1.08
      });
    }
  }

  function playGenericSpecial() {
    playTone({
      freq: 540,
      end: 1180,
      type: "sine",
      duration: 0.18,
      gain: 0.08
    });

    playTone({
      freq: 820,
      end: 1640,
      type: "triangle",
      duration: 0.12,
      gain: 0.05,
      delay: 0.055
    });

    playNoise({
      duration: 0.08,
      gain: 0.035,
      frequency: 2600,
      q: 1.1,
      type: "highpass",
      delay: 0.02
    });
  }

  function playArcaneEffect(kind = "generic") {
    const key = String(kind || "generic");

    if (key === "explosion" || key === "explosive_ball") {
      playTone({ freq: 105, end: 38, type: "sawtooth", duration: 0.38, gain: 0.13 });
      playNoise({ duration: 0.34, gain: 0.15, frequency: 360, q: 0.7, type: "lowpass" });
      return;
    }

    if (key === "portal" || key === "portal_pocket") {
      playTone({ freq: 240, end: 1180, type: "sine", duration: 0.34, gain: 0.075 });
      playTone({ freq: 1040, end: 180, type: "triangle", duration: 0.42, gain: 0.055, delay: 0.08 });
      return;
    }

    if (key === "time_freeze_started" || key === "time_freeze") {
      [980, 740, 520].forEach((freq, index) => {
        playTone({ freq, end: freq * 0.82, type: "sine", duration: 0.24, gain: 0.045, delay: index * 0.07 });
      });
      playNoise({ duration: 0.28, gain: 0.025, frequency: 3200, q: 4, type: "bandpass" });
      return;
    }

    if (key === "time_freeze_finished") {
      [520, 740, 980].forEach((freq, index) => {
        playTone({ freq, end: freq * 1.08, type: "sine", duration: 0.18, gain: 0.04, delay: index * 0.055 });
      });
      return;
    }

    if (key === "shield_block" || key === "shield_pocket") {
      playTone({ freq: 920, end: 610, type: "triangle", duration: 0.26, gain: 0.09 });
      playTone({ freq: 1380, end: 1050, type: "sine", duration: 0.20, gain: 0.045, delay: 0.025 });
      return;
    }

    if (key === "ghost_pass" || key === "ghost_ball" || key === "ghost_hand") {
      playNoise({ duration: 0.24, gain: 0.045, frequency: 2600, q: 1.5, type: "highpass" });
      playTone({ freq: 620, end: 1720, type: "sine", duration: 0.31, gain: 0.055 });
      return;
    }

    if (key === "rewind") {
      [980, 780, 610, 440].forEach((freq, index) => {
        playTone({ freq, end: freq * 0.72, type: "triangle", duration: 0.14, gain: 0.045, delay: index * 0.045 });
      });
      return;
    }

    if (key === "ice_zone") {
      [1320, 1760, 2100].forEach((freq, index) => {
        playTone({ freq, end: freq * 1.04, type: "sine", duration: 0.16, gain: 0.032, delay: index * 0.045 });
      });
      return;
    }

    if (key === "sticky_zone") {
      playTone({ freq: 190, end: 82, type: "triangle", duration: 0.34, gain: 0.075 });
      playNoise({ duration: 0.22, gain: 0.05, frequency: 480, q: 1.2, type: "lowpass" });
      return;
    }

    if (
      key === "magic_ball_touch" ||
      key === "arcane_ball_spawned" ||
      key === "arcane_ball_potted" ||
      key === "magic_reward"
    ) {
      const notes = key === "arcane_ball_potted" ? [660, 990, 1320] : [880, 1175, 1760];
      notes.forEach((freq, index) => {
        playTone({ freq, end: freq * 1.06, type: "sine", duration: 0.16, gain: 0.04, delay: index * 0.055 });
      });
      playNoise({ duration: 0.10, gain: 0.022, frequency: 3600, q: 2.2, type: "highpass" });
      return;
    }

    if (key === "arcane_ball_expired") {
      playTone({ freq: 720, end: 180, type: "sine", duration: 0.42, gain: 0.055 });
      return;
    }

    playGenericSpecial();
  }

  function playNotification(type = "info") {
    if (!enabled || !ctx) return;
    const currentTime = now();
    if (currentTime - lastNotificationAt < 0.09) return;
    lastNotificationAt = currentTime;

    const signatures = {
      info: { freq: 430, end: 390, type: "sine", gain: 0.014 },
      success: { freq: 620, end: 790, type: "sine", gain: 0.019 },
      error: { freq: 250, end: 165, type: "triangle", gain: 0.022 },
      arcana: { freq: 860, end: 1160, type: "sine", gain: 0.018 }
    };
    const signature = signatures[type] || signatures.info;
    playTone({ ...signature, duration: 0.075 });
  }

  function playArcaneShot(effectIds = []) {
    const ids = effectIds.filter((id) => id !== "table_zones");
    if (ids.length === 0) return;

    const primary = ids[0];
    const roots = {
      perfect_force: 740,
      soft_touch: 360,
      expanded_vision: 920,
      stabilizer: 610,
      pressure: 230,
      light_magnet: 520,
      magnetic_ball: 460,
      double_shot: 680,
      golden_pocket: 820
    };
    const root = roots[primary] || 560;

    playNoise({
      duration: 0.14,
      gain: 0.026,
      frequency: 1800 + ids.length * 260,
      q: 1.4,
      type: "bandpass"
    });
    playTone({ freq: root, end: root * 1.38, type: "sine", duration: 0.20, gain: 0.042 });
    playTone({ freq: root * 1.5, end: root * 1.72, type: "triangle", duration: 0.16, gain: 0.024, delay: 0.035 });
  }

  return {
    ensure,

    playClick() {
      playTone({
        freq: 760,
        end: 480,
        type: "square",
        duration: 0.05,
        gain: 0.04
      });
    },

    playShot(power = 0.5) {
      playNoise({
        duration: 0.08 + power * 0.08,
        gain: 0.06 + power * 0.16,
        frequency: 800 + power * 1000,
        q: 0.8
      });

      playTone({
        freq: 130 + power * 70,
        end: 72,
        type: "triangle",
        duration: 0.09 + power * 0.08,
        gain: 0.08 + power * 0.10
      });
    },

    playCollision(strength = 100) {
      const normalized = Math.min(1, strength / 900);

      playNoise({
        duration: 0.03 + normalized * 0.055,
        gain: 0.02 + normalized * 0.16,
        frequency: 1200 + normalized * 1500,
        q: 1.3,
        type: "bandpass"
      });

      playTone({
        freq: 360 + normalized * 420,
        end: 180,
        type: "triangle",
        duration: 0.04 + normalized * 0.05,
        gain: 0.02 + normalized * 0.08
      });
    },

    playCushion(strength = 100) {
      const normalized = Math.min(1, strength / 900);

      playNoise({
        duration: 0.035 + normalized * 0.05,
        gain: 0.015 + normalized * 0.10,
        frequency: 420 + normalized * 380,
        q: 0.9,
        type: "lowpass"
      });

      playTone({
        freq: 130 + normalized * 60,
        end: 78,
        type: "sine",
        duration: 0.05 + normalized * 0.04,
        gain: 0.02 + normalized * 0.05
      });
    },

    playPocket() {
      playTone({
        freq: 420,
        end: 110,
        type: "triangle",
        duration: 0.17,
        gain: 0.12
      });

      playNoise({
        duration: 0.09,
        gain: 0.09,
        frequency: 860,
        q: 0.9,
        type: "lowpass",
        delay: 0.01
      });
    },

    playFoul() {
      playTone({
        freq: 220,
        end: 90,
        type: "sawtooth",
        duration: 0.22,
        gain: 0.12
      });

      playTone({
        freq: 140,
        end: 60,
        type: "square",
        duration: 0.18,
        gain: 0.08,
        delay: 0.06
      });
    },

    playScore() {
      playTone({
        freq: 620,
        end: 980,
        type: "sine",
        duration: 0.1,
        gain: 0.09
      });

      playTone({
        freq: 780,
        end: 1280,
        type: "triangle",
        duration: 0.08,
        gain: 0.06,
        delay: 0.05
      });
    },

    playTurnChange() {
      playTone({
        freq: 520,
        end: 420,
        type: "triangle",
        duration: 0.08,
        gain: 0.05
      });
    },

    playCountdownTick(secondsLeft = 10) {
      const seconds = Math.max(1, Math.ceil(Number(secondsLeft) || 1));
      const urgent = seconds <= 3;

      playTone({
        freq: urgent ? 920 : 650,
        end: urgent ? 760 : 590,
        type: urgent ? "square" : "sine",
        duration: urgent ? 0.11 : 0.075,
        gain: urgent ? 0.075 : 0.045
      });

      if (seconds === 1) {
        playTone({
          freq: 1040,
          end: 820,
          type: "square",
          duration: 0.12,
          gain: 0.065,
          delay: 0.14
        });
      }
    },

    playWin() {
      const notes = [523, 659, 784, 1047];

      notes.forEach((freq, i) => {
        playTone({
          freq,
          end: freq * 1.02,
          type: "triangle",
          duration: 0.18,
          gain: 0.10,
          delay: i * 0.11
        });

        playTone({
          freq: freq * 2,
          end: freq * 2,
          type: "sine",
          duration: 0.12,
          gain: 0.04,
          delay: i * 0.11 + 0.02
        });
      });
    },

    playLoss() {
      const notes = [440, 349, 294, 196];

      notes.forEach((freq, i) => {
        playTone({
          freq,
          end: freq * 0.7,
          type: "sawtooth",
          duration: 0.22,
          gain: 0.08,
          delay: i * 0.14
        });
      });

      playNoise({
        duration: 0.4,
        gain: 0.06,
        frequency: 280,
        q: 0.7,
        type: "lowpass",
        delay: 0.4
      });
    },

    playShopOpen() {
      const notes = [392, 523, 659];

      notes.forEach((freq, i) => {
        playTone({
          freq,
          end: freq * 1.02,
          type: "sine",
          duration: 0.18,
          gain: 0.07,
          delay: i * 0.07
        });
      });
    },

    playBuy() {
      playTone({
        freq: 680,
        end: 1180,
        type: "triangle",
        duration: 0.09,
        gain: 0.10
      });

      playTone({
        freq: 1020,
        end: 1480,
        type: "sine",
        duration: 0.08,
        gain: 0.06,
        delay: 0.06
      });

      playNoise({
        duration: 0.05,
        gain: 0.05,
        frequency: 2200,
        q: 0.8,
        type: "highpass",
        delay: 0.03
      });
    },

    playReroll() {
      for (let i = 0; i < 5; i++) {
        playTone({
          freq: 520 + i * 60,
          end: 480 + i * 60,
          type: "square",
          duration: 0.04,
          gain: 0.04,
          delay: i * 0.03
        });
      }
    },

    playArcanaGain() {
      playTone({
        freq: 880,
        end: 1320,
        type: "sine",
        duration: 0.12,
        gain: 0.06
      });

      playTone({
        freq: 1320,
        end: 1760,
        type: "triangle",
        duration: 0.08,
        gain: 0.04,
        delay: 0.04
      });
    },

    playDiscard() {
      playTone({
        freq: 520,
        end: 280,
        type: "triangle",
        duration: 0.12,
        gain: 0.06
      });

      playNoise({
        duration: 0.07,
        gain: 0.04,
        frequency: 720,
        q: 0.8,
        type: "lowpass",
        delay: 0.03
      });
    },

    playSpecial: playGenericSpecial,
    playArcaneEffect,
    playArcaneShot,
    playNotification,
    playBallReturn,
    setEnabled,
    setAmbient,
    isAmbientEnabled() {
      return ambientEnabled;
    },
    isEnabled() {
      return enabled;
    }
  };
})();
