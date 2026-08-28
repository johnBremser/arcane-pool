const AudioSys = (() => {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = false;

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
        enabled = true;
      } catch (err) {
        enabled = false;
      }
    }

    if (ctx && ctx.state === "suspended") {
      ctx.resume();
    }

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
    if (!enabled || !ctx) return;

    const {
      freq = 440,
      end = null,
      type = "sine",
      duration = 0.1,
      gain = 0.2,
      delay = 0
    } = options;

    const t = now() + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    if (end !== null && end !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
    }

    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(amp);
    amp.connect(master);

    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  function playNoise(options) {
    if (!enabled || !ctx || !noiseBuffer) return;

    const {
      duration = 0.08,
      gain = 0.18,
      frequency = 1200,
      q = 1,
      type = "lowpass",
      delay = 0
    } = options;

    const t = now() + delay;

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, t);
    filter.Q.value = q;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);

    source.start(t);
    source.stop(t + duration + 0.03);
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

    playSpecial() {
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
  };
})();
