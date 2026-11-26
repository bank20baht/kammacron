"""
An original, light and bright background track, synthesised here (no samples, no licence to
worry about): ukulele-like strums, a soft bass, a shaker, and a glockenspiel tune over
C - G - Am - F at 104 bpm. Also a paper "pop" for the pop-up cards.

  python3 music.py <seconds> <out.wav>
"""
import sys, wave

import numpy as np

SR = 44100
BPM = 104
BEAT = 60 / BPM
BAR = 4 * BEAT

rng = np.random.default_rng(7)


def hz(note):
    """'C4' -> Hz (A4 = 440)."""
    names = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    n = names[note[0]] + (1 if '#' in note else 0)
    octave = int(note[-1])
    return 440 * 2 ** ((n + 12 * (octave - 4)) / 12)


def pluck(f, dur, amp):
    """A nylon-string pluck: harmonics that fade faster the higher they are, and a soft attack."""
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for k in range(1, 9):
        if f * k > 9000:
            break
        out += (1 / k ** 1.25) * np.exp(-t * (2.6 + 1.3 * k ** 0.85)) * np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6))
    attack = np.minimum(1, t / 0.004)
    click = rng.normal(0, 1, len(t)) * np.exp(-t * 300) * 0.08
    return amp * (out * attack + click)


def glock(f, dur, amp):
    t = np.arange(int(dur * SR)) / SR
    parts = [(1, 1, 2.2), (2.756, .32, 4.5), (5.404, .14, 7), (8.933, .05, 10)]
    out = sum(a * np.exp(-t * d) * np.sin(2 * np.pi * f * m * t) for m, a, d in parts)
    return amp * out * np.minimum(1, t / 0.002)


def bass(f, dur, amp):
    t = np.arange(int(dur * SR)) / SR
    out = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return amp * out * np.exp(-t * 2.2) * np.minimum(1, t / 0.01)


def shaker(amp):
    t = np.arange(int(0.09 * SR)) / SR
    n = rng.normal(0, 1, len(t))
    n = np.diff(np.concatenate([[0], n]))  # brighter
    return amp * n * np.minimum(1, t / 0.006) * np.exp(-t * 45)


# reentrant ukulele voicings (G C E A tuning), low to high as strummed
CHORDS = {
    'C': (['G4', 'C4', 'E4', 'C5'], 'C2'),
    'G': (['G4', 'D4', 'G4', 'B4'], 'G2'),
    'Am': (['A4', 'C4', 'E4', 'A4'], 'A2'),
    'F': (['A4', 'C4', 'F4', 'A4'], 'F2'),
}
PROGRESSION = ['C', 'G', 'Am', 'F']
# strum pattern, in beats: (time, down?, accent)
STRUM = [(0, True, 1.0), (1, True, .7), (1.5, False, .55), (2.5, False, .6), (3, True, .75), (3.5, False, .5)]
# the tune, one 4-bar phrase per pass (beat, note, length in beats), over C G Am F
TUNE_A = [(0, 'E5', 1), (1, 'G5', 1), (2, 'C6', 1.5), (3.5, 'G5', .5),
          (4, 'B5', 1), (5, 'D6', 1), (6, 'G5', 2),
          (8, 'C6', 1), (9, 'B5', .5), (9.5, 'A5', .5), (10, 'E5', 2),
          (12, 'F5', 1), (13, 'A5', 1), (14, 'C6', 1), (15, 'G5', 1)]
TUNE_B = [(0, 'G5', .5), (0.5, 'A5', .5), (1, 'G5', 1), (2, 'E5', 1), (3, 'C5', 1),
          (4, 'D5', 1), (5, 'G5', 1.5), (6.5, 'B5', .5), (7, 'D6', 1),
          (8, 'E6', 1.5), (9.5, 'C6', .5), (10, 'A5', 1), (11, 'E5', 1),
          (12, 'F5', .5), (12.5, 'G5', .5), (13, 'A5', 1), (14, 'G5', 2)]


def add(track, at, sound):
    i = int(at * SR)
    j = min(len(track), i + len(sound))
    if i < len(track):
        track[i:j] += sound[:j - i]


def song(seconds):
    n_bars = int(np.ceil(seconds / BAR)) + 1
    length = int((n_bars * BAR + 2) * SR)
    uke, low, shake, bell = (np.zeros(length) for _ in range(4))
    for b in range(n_bars):
        chord = PROGRESSION[b % 4]
        notes, root = CHORDS[chord]
        t0 = b * BAR
        for beat, down, acc in STRUM:
            order = notes if down else notes[::-1]
            for k, note in enumerate(order):
                add(uke, t0 + beat * BEAT + k * 0.011 + rng.uniform(0, 0.004), pluck(hz(note), 1.6, 0.16 * acc))
        if b >= 2:
            add(low, t0, bass(hz(root), BEAT * 2, 0.32))
            add(low, t0 + 2 * BEAT, bass(hz(root) * (1.5 if b % 2 else 1), BEAT * 2, 0.24))
            for e in range(8):
                add(shake, t0 + e * BEAT / 2 + rng.uniform(0, 0.006), shaker(0.05 if e % 2 else 0.08))
        # the tune comes in after two bars, A then B, with a rest every third phrase
        phrase = (b - 2) // 4
        if b >= 2 and (b - 2) % 4 == 0 and phrase % 3 != 2:
            tune = TUNE_A if phrase % 2 == 0 else TUNE_B
            for beat, note, dur in tune:
                add(bell, t0 + beat * BEAT, glock(hz(note), max(1.0, dur * BEAT + 0.6), 0.13))
    mix = uke + low + shake + bell
    # a little room: two soft echoes
    for delay, gain in [(0.083, 0.22), (0.191, 0.13)]:
        d = int(delay * SR)
        mix[d:] += gain * mix[:-d].copy()
    mix = mix[:int(seconds * SR)]
    fade_in, fade_out = int(0.8 * SR), int(2.5 * SR)
    mix[:fade_in] *= np.linspace(0, 1, fade_in)
    mix[-fade_out:] *= np.linspace(1, 0, fade_out)
    return mix / np.max(np.abs(mix)) * 0.8


def pop():
    """A soft paper pop: a falling blip with a breath of paper noise."""
    t = np.arange(int(0.16 * SR)) / SR
    f = 700 * np.exp(-t * 18) + 220
    blip = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 32)
    paper = np.convolve(rng.normal(0, 1, len(t)), np.ones(6) / 6, 'same') * np.exp(-t * 26) * 0.35
    return 0.6 * (blip + paper)


def write(path, data):
    pcm = (np.clip(data, -1, 1) * 32767).astype('<i2')
    stereo = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(stereo.tobytes())


def sfx_track(seconds, times):
    track = np.zeros(int(seconds * SR))
    p = pop()
    for t in times:
        add(track, t, p * rng.uniform(0.8, 1.0))
    return track


if __name__ == '__main__':
    write(sys.argv[2], song(float(sys.argv[1])))
