/**
 * Road360 audio meter worklet.
 *
 * Plain JavaScript on purpose — this file is served as-is from /public and is
 * NOT bundled. AudioWorklet modules load by URL into a separate global scope,
 * so anything the bundler did to it (imports, helpers, source maps) would break
 * at `addModule` time.
 *
 * Runs on the audio thread. Per 128-sample render quantum it accumulates
 * sum-of-squares and peak, and every hop posts a level report plus a copy of
 * the most recent window as a *transferable*, so the main thread never copies
 * audio and the audio thread never allocates in steady state.
 */

const HOP_MS = 50;
const FRAME_SIZE = 1024;
const POOL_SIZE = 4;

class Road360MeterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const opts = (options && options.processorOptions) || {};
    this.hopSamples = Math.max(1, Math.round((sampleRate * (opts.hopMs || HOP_MS)) / 1000));
    this.frameSize = opts.frameSize || FRAME_SIZE;

    // Rolling window of the most recent `frameSize` samples.
    this.window = new Float32Array(this.frameSize);
    this.windowIndex = 0;

    // Recycled transfer buffers. Without a pool we would allocate a 4 KB array
    // 20 times a second for the length of a drive.
    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push(new Float32Array(this.frameSize));
    }

    this.sumSquares = 0;
    this.peak = 0;
    this.samplesSinceHop = 0;
    this.running = true;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'recycle' && data.buffer) {
        if (this.pool.length < POOL_SIZE) this.pool.push(new Float32Array(data.buffer));
      } else if (data.type === 'stop') {
        this.running = false;
      }
    };
  }

  process(inputs) {
    if (!this.running) return false;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];

      this.sumSquares += sample * sample;
      const abs = sample < 0 ? -sample : sample;
      if (abs > this.peak) this.peak = abs;

      this.window[this.windowIndex] = sample;
      this.windowIndex = (this.windowIndex + 1) % this.frameSize;
      this.samplesSinceHop++;
    }

    if (this.samplesSinceHop >= this.hopSamples) {
      this.emit();
      this.sumSquares = 0;
      this.peak = 0;
      this.samplesSinceHop = 0;
    }

    return true;
  }

  emit() {
    const rms = Math.sqrt(this.sumSquares / Math.max(1, this.samplesSinceHop));
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-10));
    const peakDb = 20 * Math.log10(Math.max(this.peak, 1e-10));

    const buffer = this.pool.pop();
    if (!buffer) {
      // Pool exhausted — the main thread is behind. Send levels only rather
      // than allocating, so a slow frame degrades the spectrum, not the meter.
      this.port.postMessage({ type: 'level', t: currentTime * 1000, rmsDb, peakDb });
      return;
    }

    // Unroll the ring into chronological order so the FFT window is contiguous.
    const start = this.windowIndex;
    for (let i = 0; i < this.frameSize; i++) {
      buffer[i] = this.window[(start + i) % this.frameSize];
    }

    this.port.postMessage(
      { type: 'frame', t: currentTime * 1000, rmsDb, peakDb, buffer: buffer.buffer },
      [buffer.buffer],
    );
  }
}

registerProcessor('road360-meter', Road360MeterProcessor);
