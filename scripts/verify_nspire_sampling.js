/**
 * Verification Script for HUD NSPIRE Sampling Logic
 * 
 * Run with: node scripts/verify_nspire_sampling.js
 */

const { getNspireSampleSize, selectNspireUnits } = require('../utils/nspireSampling');

console.log('=== Verifying HUD NSPIRE Sampling Logic ===\n');

// 1. Verify Sample Size Table
const testCases = [
    { units: 1, expected: 1 },
    { units: 5, expected: 5 },
    { units: 25, expected: 25 },
    { units: 28, expected: 26 },
    { units: 100, expected: 33 },
    { units: 1000, expected: 38 },
    { units: 10000, expected: 39 } // Cap check
];

console.log('--- Checking Sample Size Table ---');
let tablePass = true;
testCases.forEach(test => {
    const result = getNspireSampleSize(test.units);
    if (result === test.expected) {
        console.log(`[PASS] N=${test.units} -> n=${result}`);
    } else {
        console.log(`[FAIL] N=${test.units} -> Expected ${test.expected}, Got ${result}`);
        tablePass = false;
    }
});

if (tablePass) console.log('>> Sample Size Logic Verified\n');

// 2. Verify Randomness & Seeding
console.log('--- Checking Seeding & Selection ---');
const totalUnits = 50; // Should sample 30
const mockUnits = Array.from({ length: totalUnits }, (_, i) => ({
    unitId: `U-${i + 1}`,
    status: 'occupied'
}));

// Run 1: Seed A
const resultA = selectNspireUnits(mockUnits, { seed: 'inspection-123' });
// Run 2: Seed A (Should match Run 1)
const resultB = selectNspireUnits(mockUnits, { seed: 'inspection-123' });
// Run 3: Seed B (Should differ)
const resultC = selectNspireUnits(mockUnits, { seed: 'inspection-456' });

// Check consistency
const primaryA = resultA.primaryUnits.map(u => u.unitId).join(',');
const primaryB = resultB.primaryUnits.map(u => u.unitId).join(',');
const primaryC = resultC.primaryUnits.map(u => u.unitId).join(',');

console.log(`Run A Primary Units: ${resultA.primaryUnits.length}`);
console.log(`Run B Primary Units: ${resultB.primaryUnits.length}`);

if (primaryA === primaryB) {
    console.log('[PASS] Seeded results are identical');
} else {
    console.log('[FAIL] Seeded results differ!');
}

if (primaryA !== primaryC) {
    console.log('[PASS] Different seeds produce different results');
} else {
    console.log('[FAIL] Different seeds produced identical results (unlikely but possible)');
}

// 3. Verify Alternates
console.log('--- Checking Alternates ---');
const alternates = resultA.alternateUnits;
console.log(`Alternates Count: ${alternates.length}`);
if (alternates.length === 3) {
    console.log('[PASS] Exactly 3 alternates selected');
} else {
    console.log(`[FAIL] Expected 3 alternates, got ${alternates.length}`);
}

// Check for overlap
const primaryIds = new Set(resultA.primaryUnits.map(u => u.unitId));
const hasOverlap = alternates.some(u => primaryIds.has(u.unitId));
if (!hasOverlap) {
    console.log('[PASS] No overlap between primary and alternates');
} else {
    console.log('[FAIL] Overlap detected between primary and alternates');
}

console.log('\n=== Verification Complete ===');
