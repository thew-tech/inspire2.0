/**
 * HUD NSPIRE Compliant Sampling Utility
 * 
 * Implements the official HUD NSPIRE staggered sample size table and 
 * unbiased random selection using Fisher-Yates shuffle with seed support.
 */

// HUD NSPIRE Sample Size Table (90% Confidence, 6% Margin of Error)
// Source: HUD NSPIRE Sampling Protocol
const SAMPLE_SIZE_TABLE = [
    { min: 1, max: 1, sample: 1 },
    { min: 2, max: 2, sample: 2 },
    { min: 3, max: 3, sample: 3 },
    { min: 4, max: 4, sample: 4 },
    { min: 5, max: 5, sample: 5 },
    { min: 6, max: 6, sample: 6 },
    { min: 7, max: 7, sample: 7 },
    { min: 8, max: 8, sample: 8 },
    { min: 9, max: 9, sample: 9 },
    { min: 10, max: 10, sample: 10 },
    { min: 11, max: 11, sample: 11 },
    { min: 12, max: 12, sample: 12 },
    { min: 13, max: 13, sample: 13 },
    { min: 14, max: 14, sample: 14 },
    { min: 15, max: 15, sample: 15 },
    { min: 16, max: 16, sample: 16 },
    { min: 17, max: 17, sample: 17 },
    { min: 18, max: 18, sample: 18 },
    { min: 19, max: 19, sample: 19 },
    { min: 20, max: 20, sample: 20 },
    { min: 21, max: 21, sample: 21 },
    { min: 22, max: 22, sample: 22 },
    { min: 23, max: 23, sample: 23 },
    { min: 24, max: 24, sample: 24 },
    { min: 25, max: 25, sample: 25 },
    { min: 26, max: 29, sample: 26 },
    { min: 30, max: 34, sample: 27 },
    { min: 35, max: 40, sample: 28 },
    { min: 41, max: 47, sample: 29 },
    { min: 48, max: 56, sample: 30 },
    { min: 57, max: 67, sample: 31 },
    { min: 68, max: 81, sample: 32 },
    { min: 82, max: 101, sample: 33 },
    { min: 102, max: 130, sample: 34 },
    { min: 131, max: 175, sample: 35 },
    { min: 176, max: 257, sample: 36 },
    { min: 258, max: 449, sample: 37 },
    { min: 450, max: 1461, sample: 38 },
    { min: 1462, max: 999999, sample: 39 } // Cap at 39 for very large properties unlikely to be exceeded in this context, effectively max sample
];

/**
 * Calculates the required sample size based on the total number of eligible units.
 * @param {number} totalUnits - Total number of eligible units.
 * @returns {number} The required sample size 'n'.
 */
const getNspireSampleSize = (totalUnits) => {
    if (!totalUnits || totalUnits <= 0) return 0;

    const entry = SAMPLE_SIZE_TABLE.find(range => totalUnits >= range.min && totalUnits <= range.max);

    // If no entry found (e.g. exceptionally large number not covered), default to max required
    if (!entry) return 39;

    // If total units is small, checking if sample size exceeds total (should generally match table)
    return Math.min(entry.sample, totalUnits);
};

/**
 * Simple Linear Congruential Generator (LCG) for seeded random number generation.
 * Returns a function that generates numbers between 0 and 1.
 * @param {number} a - Seed value.
 */
function mulberry32(a) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

/**
 * Performs a Fisher-Yates shuffle on the array.
 * @param {Array} array - The array to shuffle.
 * @param {string|number} seed - Optional seed for reproducibility.
 * @returns {Array} The shuffled array.
 */
const fisherYatesShuffle = (array, seed = null) => {
    const shuffled = [...array];
    let currentIndex = shuffled.length;
    let randomIndex;

    // Create PRNG or use Math.random
    // If seed is provided, simple hash to integer key
    let randomFunc = Math.random;
    if (seed) {
        let seedNum = 0;
        const strSeed = String(seed);
        for (let i = 0; i < strSeed.length; i++) {
            seedNum = Math.imul(31, seedNum) + strSeed.charCodeAt(i) | 0;
        }
        randomFunc = mulberry32(seedNum);
    }

    // While there remain elements to shuffle...
    while (currentIndex !== 0) {
        // Pick a remaining element...
        randomIndex = Math.floor(randomFunc() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [shuffled[currentIndex], shuffled[randomIndex]] = [
            shuffled[randomIndex], shuffled[currentIndex]];
    }

    return shuffled;
};

/**
 * Selects random units complying with NSPIRE protocol.
 * @param {Array} units - Array of Unit objects.
 * @param {Object} options - { seed: string, totalUnitsOverride: number }
 * @returns {Object} { primaryUnits: [], alternateUnits: [], sampleSize: number }
 */
const selectNspireUnits = (units, options = {}) => {
    // 1. Filter Inaccessible/Offline Units (Assuming 'under-maintenance' or specific status flags)
    // Logic: Units must be 'occupied' or 'vacant', or 'not-inspected'. 
    // Exclude 'under-maintenance' or anything explicitly marked offline.
    // Note: This logic depends on the Unit model structure.

    const eligibleUnits = units.filter(u => {
        // If unit has a specific 'accessible' flag, use it.
        // Otherwise rely on status.
        return u.status !== 'under-maintenance';
    });

    const N = eligibleUnits.length;

    // 2. Determine Sample Size (n)
    const n = getNspireSampleSize(N);

    // 3. Random Selection
    // Seed defaults to Date.now() if not provided, for randomness
    const seed = options.seed || Date.now().toString();
    const shuffledUnits = fisherYatesShuffle(eligibleUnits, seed);

    // 4. Select Primary Units
    const primaryUnits = shuffledUnits.slice(0, n);

    // 5. Select Alternate Units (Exactly 3 if possible)
    // Alternates are the next 3 units after the primary sample
    const alternatesStartIndex = n;
    const alternatesEndIndex = Math.min(n + 3, shuffledUnits.length);
    const alternateUnits = shuffledUnits.slice(alternatesStartIndex, alternatesEndIndex);

    return {
        primaryUnits,
        alternateUnits,
        sampleSize: n,
        universeSize: N,
        seedUsed: seed
    };
};

module.exports = {
    getNspireSampleSize,
    fisherYatesShuffle,
    selectNspireUnits
};
