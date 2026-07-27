/**
 * Radix-2 FFT with a Hann window, allocation-free after construction.
 *
 * Hand-rolled rather than pulled from a library because it runs on every audio
 * hop (20×/s for the whole drive) and must not allocate — a per-frame array
 * would hand the GC a steady drip of garbage for an hour straight, which on a
 * phone shows up as both jank and battery.
 */
export class FFT {
  readonly size: number;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;
  private readonly reverseTable: Uint32Array;
  private readonly window: Float32Array;
  private readonly real: Float32Array;
  private readonly imag: Float32Array;

  constructor(size: number) {
    if ((size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`);
    }
    this.size = size;
    this.real = new Float32Array(size);
    this.imag = new Float32Array(size);

    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cosTable[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sinTable[i] = Math.sin((-2 * Math.PI * i) / size);
    }

    // Bit-reversal permutation, precomputed.
    this.reverseTable = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let rev = 0;
      for (let b = 0; b < bits; b++) {
        rev = (rev << 1) | ((i >> b) & 1);
      }
      this.reverseTable[i] = rev;
    }

    // Hann window. Without it, spectral leakage smears a horn's fundamental
    // across neighbouring bins and the prominence test stops discriminating.
    this.window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
  }

  /**
   * Compute the magnitude spectrum of `input` into `output`.
   * `output` must have length `size / 2`. Neither array is retained.
   */
  magnitudes(input: Float32Array, output: Float32Array): void {
    const n = this.size;
    const { real, imag, reverseTable, cosTable, sinTable, window } = this;

    // Window and bit-reverse in one pass. `imag` is zeroed at every index
    // regardless of the permutation, so it needs no reordering.
    for (let i = 0; i < n; i++) {
      const src = i < input.length ? input[i]! : 0;
      real[reverseTable[i]!] = src * window[i]!;
      imag[i] = 0;
    }

    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const cos = cosTable[k]!;
          const sin = sinTable[k]!;
          const a = i + j;
          const b = a + half;

          const tre = real[b]! * cos - imag[b]! * sin;
          const tim = real[b]! * sin + imag[b]! * cos;

          real[b] = real[a]! - tre;
          imag[b] = imag[a]! - tim;
          real[a] = real[a]! + tre;
          imag[a] = imag[a]! + tim;
        }
      }
    }

    const half = n >> 1;
    for (let i = 0; i < half; i++) {
      output[i] = Math.hypot(real[i]!, imag[i]!) / half;
    }
  }

  /** Hz per output bin. */
  binWidth(sampleRate: number): number {
    return sampleRate / this.size;
  }
}

/** Convert a linear amplitude (0..1) to dBFS, floored so silence is finite. */
export function amplitudeToDb(amplitude: number): number {
  return 20 * Math.log10(Math.max(amplitude, 1e-10));
}

/** RMS of a time-domain buffer. */
export function bufferRms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i]! * buffer[i]!;
  return Math.sqrt(sum / Math.max(1, buffer.length));
}

export function bufferPeak(buffer: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = Math.abs(buffer[i]!);
    if (v > peak) peak = v;
  }
  return peak;
}
