// BCH error correction for TrustMark watermark payloads.
//
// A TypeScript port of Adobe's readable Python implementation
// (trustmark/bchecc.py, MIT licence, https://github.com/adobe/trustmark),
// rather than the obfuscated bch_ecc.min.js in its JavaScript example.
// Words are kept as unsigned 32-bit numbers (`>>> 0`), matching the
// Python code's `& 0xffffffff` masking.

interface Polynomial {
  deg: number;
  c: number[];
}

const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);

/** Index of the highest set bit (floor(log2 x)); 0 for x <= 1. */
function deg(x: number): number {
  let count = 0;
  x >>>= 0;
  while (x >>> 1) {
    x >>>= 1;
    count++;
  }
  return count;
}

const load4bytes = (d: number[], o: number) =>
  (((d[o] ?? 0) << 24) | ((d[o + 1] ?? 0) << 16) | ((d[o + 2] ?? 0) << 8) | (d[o + 3] ?? 0)) >>> 0;

export class BCH {
  readonly t: number;
  readonly m: number;
  readonly n: number;
  readonly eccBits: number;
  readonly eccBytes: number;
  private exponents: number[];
  private logarithms: number[];
  private elpPre: number[];
  private cyclicTab: number[] = [];
  private eccBuf: number[] = [];

  constructor(t: number, poly: number) {
    let m = 0;
    for (let tmp = poly; tmp >> 1; tmp >>= 1) m++;
    this.t = t;
    this.m = m;
    this.n = 2 ** m - 1;
    this.eccBytes = ceilDiv(m * t, 8);
    const n = this.n;

    // Galois field tables.
    this.exponents = new Array(n + 1).fill(0);
    this.logarithms = new Array(n + 1).fill(0);
    this.elpPre = new Array(m + 1).fill(0);
    const k = 2 ** deg(poly);
    let x = 1;
    for (let i = 0; i < n; i++) {
      this.exponents[i] = x;
      this.logarithms[x] = i;
      x *= 2;
      if (x & k) x ^= poly;
    }
    this.logarithms[0] = 0;
    this.exponents[n] = 1;

    // Generator polynomial from the roots of the minimal polynomials.
    const roots = new Array(n + 1).fill(0);
    for (let i = 0; i < t; i++) {
      let r = 2 * i + 1;
      for (let j = 0; j < m; j++) {
        roots[r] = 1;
        r = this.mod(2 * r);
      }
    }
    const g: Polynomial = { deg: 0, c: new Array(m * t + 1).fill(0) };
    g.c[0] = 1;
    for (let i = 0; i < n; i++) {
      if (!roots[i]) continue;
      const r = this.exponents[i];
      g.c[g.deg + 1] = 1;
      for (let j = g.deg; j > 0; j--) g.c[j] = this.gMul(g.c[j], r) ^ g.c[j - 1];
      g.c[0] = this.gMul(g.c[0], r);
      g.deg++;
    }
    const genpoly = new Array(ceilDiv(m * t + 1, 32)).fill(0);
    for (let remaining = g.deg + 1, i = 0; remaining > 0; i++) {
      const nbits = remaining > 32 ? 32 : remaining;
      let word = 0;
      for (let j = 0; j < nbits; j++) if (g.c[remaining - 1 - j]) word = (word | (2 ** (31 - j))) >>> 0;
      genpoly[i] = word;
      remaining -= nbits;
    }
    this.eccBits = g.deg;
    this.buildCyclic(genpoly);

    // Precomputed values for solving degree-2 error locator polynomials.
    let aexp = 0;
    let sum = 0;
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) sum ^= this.gPow(i * 2 ** j);
      if (sum) {
        aexp = this.exponents[i];
        break;
      }
    }
    const precomp = new Array(31).fill(0);
    let remaining = m;
    for (let xx = 0; xx <= n && remaining; xx++) {
      let y = this.gSqrt(xx) ^ xx;
      for (let i = 0; i < 2; i++) {
        const r = this.logarithms[y];
        if (y && r < m && !precomp[r]) {
          this.elpPre[r] = xx;
          precomp[r] = 1;
          remaining--;
          break;
        }
        y ^= aexp;
      }
    }
  }

  private mod(v: number) {
    return v < this.n ? v : v - this.n;
  }
  private modn(v: number) {
    const n = this.n;
    while (v >= n) {
      v -= n;
      v = (v & n) + (v >> this.m);
    }
    return v;
  }
  private gMul(a: number, b: number) {
    return a > 0 && b > 0 ? this.exponents[this.mod(this.logarithms[a] + this.logarithms[b])] : 0;
  }
  private gSqrt(a: number) {
    return a ? this.exponents[this.mod(2 * this.logarithms[a])] : 0;
  }
  private gPow(i: number) {
    return this.exponents[this.modn(i)];
  }

  private buildCyclic(g: number[]) {
    const l = ceilDiv(this.m * this.t, 32);
    const plen = ceilDiv(this.eccBits + 1, 32);
    const ecclen = ceilDiv(this.eccBits, 32);
    this.cyclicTab = new Array(4 * 256 * l).fill(0);
    for (let i = 0; i < 256; i++) {
      for (let b = 0; b < 4; b++) {
        const offset = (b * 256 + i) * l;
        let data = (i * 2 ** (8 * b)) >>> 0;
        while (data) {
          const d = deg(data);
          data = (data ^ (g[0] >>> (31 - d))) >>> 0;
          for (let j = 0; j < ecclen; j++) {
            const hi = d < 31 ? (g[j] << (d + 1)) >>> 0 : 0;
            const lo = j + 1 < plen ? g[j + 1] >>> (31 - d) : 0;
            this.cyclicTab[j + offset] = (this.cyclicTab[j + offset] ^ (hi | lo)) >>> 0;
          }
        }
      }
    }
  }

  /** Computes the ECC words for `data` (bytes), leaving them in eccBuf. */
  private encode(data: number[]) {
    const l = ceilDiv(this.m * this.t, 32) - 1;
    const tab = this.cyclicTab;
    const tab1 = 256 * (l + 1);
    const tab2 = 2 * tab1;
    const tab3 = 3 * tab1;
    const r = new Array(ceilDiv(31 * 64, 32)).fill(0);
    let offset = 0;
    for (let words = Math.floor(data.length / 4); words > 0; words--, offset += 4) {
      const w = (load4bytes(data, offset) ^ r[0]) >>> 0;
      const p0 = (l + 1) * (w & 0xff);
      const p1 = tab1 + (l + 1) * ((w >>> 8) & 0xff);
      const p2 = tab2 + (l + 1) * ((w >>> 16) & 0xff);
      const p3 = tab3 + (l + 1) * ((w >>> 24) & 0xff);
      for (let i = 0; i < l; i++) r[i] = (r[i + 1] ^ tab[p0 + i] ^ tab[p1 + i] ^ tab[p2 + i] ^ tab[p3 + i]) >>> 0;
      r[l] = (tab[p0 + l] ^ tab[p1 + l] ^ tab[p2 + l] ^ tab[p3 + l]) >>> 0;
    }
    const ecc = r;
    for (let posn = offset; posn < data.length; posn++) {
      let pidx = (l + 1) * (((ecc[0] >>> 24) ^ data[posn]) & 0xff);
      for (let i = 0; i < l; i++, pidx++) ecc[i] = (((ecc[i] << 8) >>> 0) | (ecc[i + 1] >>> 24)) ^ tab[pidx];
      ecc[l] = ((ecc[l] << 8) >>> 0) ^ tab[pidx];
      for (let i = 0; i <= l; i++) ecc[i] >>>= 0;
    }
    this.eccBuf = ecc;
  }

  private findRoots(dataLen: number, poly: Polynomial): number[] | null {
    const roots: number[] = [];
    if (poly.deg > 2) {
      const k = dataLen * 8 + this.eccBits;
      const rep = new Array(this.t * 2).fill(0);
      const l = this.n - this.logarithms[poly.c[poly.deg]];
      for (let i = 0; i < poly.deg; i++) rep[i] = poly.c[i] ? this.mod(this.logarithms[poly.c[i]] + l) : -1;
      rep[poly.deg] = 0;
      const syn0 = poly.c[0]
        ? this.exponents[this.mod(this.logarithms[poly.c[0]] + this.n - this.logarithms[poly.c[poly.deg]])]
        : 0;
      for (let i = this.n - k + 1; i <= this.n; i++) {
        let syn = syn0;
        for (let j = 1; j <= poly.deg; j++) if (rep[j] >= 0) syn ^= this.gPow(rep[j] + j * i);
        if (syn === 0) {
          roots.push(this.n - i);
          if (roots.length === poly.deg) break;
        }
      }
      if (roots.length < poly.deg) return null;
    }
    if (poly.deg === 1 && poly.c[0]) {
      roots.push(this.mod(this.n - this.logarithms[poly.c[0]] + this.logarithms[poly.c[1]]));
    }
    if (poly.deg === 2 && poly.c[0] && poly.c[1]) {
      const l0 = this.logarithms[poly.c[0]];
      const l1 = this.logarithms[poly.c[1]];
      const l2 = this.logarithms[poly.c[2]];
      const u = this.gPow(l0 + l2 + 2 * (this.n - l1));
      let r = 0;
      for (let v = u; v; ) {
        const i = deg(v);
        r ^= this.elpPre[i];
        v ^= 2 ** i;
      }
      if ((this.gSqrt(r) ^ r) === u) {
        roots.push(this.modn(2 * this.n - l1 - this.logarithms[r] + l2));
        roots.push(this.modn(2 * this.n - l1 - this.logarithms[r ^ 1] + l2));
      }
    }
    // Stricter than Adobe's Python: an error locator of degree d must have
    // exactly d roots, otherwise the word can't be corrected (as in Linux's lib/bch.c).
    return roots.length === poly.deg ? roots : null;
  }

  /**
   * Corrects `data` in place using the received ECC bytes. Returns the number
   * of bits corrected, or -1 if the payload can't be corrected.
   */
  decode(data: number[], recvEcc: number[]): number {
    this.encode(data);
    const eccbuf: number[] = [];
    let offset = 0;
    for (let words = Math.floor(recvEcc.length / 4); words > 0; words--, offset += 4) eccbuf.push(load4bytes(recvEcc, offset));
    if (recvEcc.length - offset > 0) eccbuf.push(load4bytes(recvEcc, offset));

    const eccwords = ceilDiv(this.m * this.t, 32);
    let sum = 0;
    for (let i = 0; i < eccwords; i++) {
      this.eccBuf[i] = (this.eccBuf[i] ^ eccbuf[i]) >>> 0;
      sum |= this.eccBuf[i];
    }
    if (sum === 0) return 0;

    // Syndromes.
    const t = this.t;
    const syn = new Array(2 * t).fill(0);
    let s = this.eccBits;
    const rem = s & 31;
    const synbuf = this.eccBuf;
    if (rem) synbuf[Math.floor(s / 32)] = (synbuf[Math.floor(s / 32)] & ~(2 ** (32 - rem) - 1)) >>> 0;
    let ptr = 0;
    while (s > 0 || ptr === 0) {
      let poly = synbuf[ptr++] >>> 0;
      s -= 32;
      while (poly) {
        const i = deg(poly);
        for (let j = 0; j < 2 * t; j += 2) syn[j] ^= this.gPow((j + 1) * (i + s));
        poly = (poly ^ 2 ** i) >>> 0;
      }
    }
    for (let i = 0; i < t; i++) syn[2 * i + 1] = this.gSqrt(syn[i]);

    // Berlekamp–Massey: error locator polynomial.
    const n = this.n;
    let pp = -1;
    let pd = 1;
    let pelp: Polynomial = { deg: 0, c: new Array(2 * t).fill(0) };
    pelp.c[0] = 1;
    const elp: Polynomial = { deg: 0, c: new Array(2 * t).fill(0) };
    elp.c[0] = 1;
    let d = syn[0];
    for (let i = 0; i < t; i++) {
      if (elp.deg > t) break;
      if (d) {
        const k = 2 * i - pp;
        const elpCopy: Polynomial = { deg: elp.deg, c: [...elp.c] };
        const tmp = this.logarithms[d] + n - this.logarithms[pd];
        for (let j = 0; j <= pelp.deg; j++) {
          if (pelp.c[j]) elp.c[j + k] ^= this.gPow(tmp + this.logarithms[pelp.c[j]]);
        }
        const newDeg = pelp.deg + k;
        if (newDeg > elp.deg) {
          elp.deg = newDeg;
          pelp = elpCopy;
          pd = d;
          pp = 2 * i;
        }
      }
      if (i < t - 1) {
        d = syn[2 * i + 2];
        for (let j = 1; j <= elp.deg; j++) d ^= this.gMul(elp.c[j], syn[2 * i + 2 - j]);
      }
    }

    const errloc = this.findRoots(data.length, elp);
    if (!errloc) return -1;
    const nbits = data.length * 8 + this.eccBits;
    for (let i = 0; i < errloc.length; i++) {
      if (errloc[i] >= nbits) return -1;
      const pos = nbits - 1 - errloc[i];
      errloc[i] = (pos & ~7) | (7 - (pos & 7));
    }
    for (const bitflip of errloc) {
      const byte = Math.floor(bitflip / 8);
      const bit = 2 ** (bitflip & 7);
      if (bitflip < (data.length + recvEcc.length) * 8) {
        if (byte < data.length) data[byte] ^= bit;
        else recvEcc[byte - data.length] ^= bit;
      }
    }
    return errloc.length;
  }
}
