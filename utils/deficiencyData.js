/**
 * NSPIRE Deficiency Data Definitions
 * 
 * Contains all NSPIRE-compliant deficiency definitions with details,
 * criteria, and code compliance information for AI-assisted inspections.
 */

// Location options for Inside inspections
const INSIDE_LOCATIONS = [
    'Basement',
    'Business Space',
    'Classroom',
    'Closet/Utility',
    'Day Care',
    'Halls/Corridors/Stairs',
    'Kitchen',
    'Laundry Room',
    'Leased Commercial',
    'Library',
    'Lobby',
    'Maintenance Shop',
    'Mechanical Room',
    'Office',
    'Other Community Space',
    'Parking Garage',
    'Patio/Porch/Balcony',
    'Receptional Room',
    'Recreation Room',
    'Refuse/Compactor Room',
    'Restrooms',
    'Salon',
    'Store',
    'Workout Room',
];

// Location options for Outside inspections
const OUTSIDE_LOCATIONS = [
    'Building Site N',
    'Building Site S',
    'Building Site W',
    'Building Site E',
    'Courtyard',
    'Exterior E',
    'Exterior N',
    'Exterior S',
    'Exterior W',
    'Garage/Carport',
    'Grounds',
    'Other',
    'Parking Lot/Driveway/Roads',
    'Patio/Porch/Balcony',
    'Playground',
    'Roof (flat)',
    'Sidewalks/Walkways/Stoops',
];

// NSPIRE Deficiency Definitions
const DEFICIENCY_DATA = [
    // Storage/Pantry
    {
        id: 'pantry-missing',
        category: 'Storage',
        deficiencySelected: 'Pantry, Food storage space is not present.',
        deficiencyDetail: 'Food, sanitation, and household supplies, evidence of previously installed, damaged or missing components.',
        deficiencyCriteria: 'Stowed items, including food, sanitation, and household supplies.',
        codeCompliance: `1. Presence & Installation - Verify cabinets/storage units are installed
2. Structural Integrity - Check doors, drawers, hinges, mounting
3. Surface Condition - Look for peeling laminate, mold, water damage
4. Functionality - Confirm locks, latches, shelving are operational
5. Fire Safety - Check clearance from heat sources (IRC §M1505, §R302.11)
6. Accessibility - Verify ADA reach range (15-48" AFF)`,
    },

    // Call-for-Aid System
    {
        id: 'call-aid-malfunction',
        category: 'Call-for-Aid',
        deficiencySelected: 'System does not function properly.',
        deficiencyDetail: 'A call-for-Aid system does not emit sound or light or send signal to annunciator.',
        deficiencyCriteria: 'The annunciator does not indicate the correct corresponding room.',
        codeCompliance: `1. Locate System Type - Wall-mounted pull cord, button-based, annunciator panel
2. Cord Placement (NSPIRE) - Must hang ≤6 inches from floor
3. Functionality Test - Activate and verify response
4. Obstruction Check - Ensure no blocked access
5. Fire & Life Safety (IRC §R314) - Check emergency system integration
6. Accessibility (IBU) - Reach range 15-48" AFF for buttons`,
    },
    {
        id: 'call-aid-blocked',
        category: 'Call-for-Aid',
        deficiencySelected: 'The system is blocked, or the pull cord is higher than 6 inches off the floor.',
        deficiencyDetail: 'Call-for-aid system is blocked. OR The pull cord end is higher than 6 inches off the floor.',
        deficiencyCriteria: 'The pull cord end is positioned more than 6 inches above the floor.',
        codeCompliance: 'NSPIRE Severity: Moderate deficiency if cord too high or missing.',
    },

    // Carbon Monoxide Alarm
    {
        id: 'co-alarm-inoperable',
        category: 'Carbon Monoxide Alarm',
        deficiencySelected: 'Carbon monoxide alarm does not produce audio or visual alarm when tested.',
        deficiencyDetail: 'Carbon monoxide alarm, inoperable.',
        deficiencyCriteria: 'With or without a battery, including low-volume.',
        codeCompliance: `1. Identify Where CO Alarms Required - Near potential CO sources
2. Visual Assessment - Check for missing or obstructed alarms
3. Functional Testing - Press test button for audible/visual alert
4. Accessibility (IBU) - Reach range 15-48" AFF
5. IRC Requirements:
   - IRC R315.2: Required in units with fuel-burning appliances
   - IRC R315.3: Install outside each sleeping area
   - IRC R315.4: Hardwired with battery backup
   - IRC R315.5: Listed per UL 2034`,
    },
    {
        id: 'co-alarm-missing',
        category: 'Carbon Monoxide Alarm',
        deficiencySelected: 'Carbon monoxide alarm is missing, not installed, or not installed in the proper location.',
        deficiencyDetail: 'The building contains a fuel-burning appliance or system, carbon monoxide alarm is missing.',
        deficiencyCriteria: 'Unit/sleeping area is located one story or less above/below attached garage without proper ventilation.',
        codeCompliance: 'IRC R315.2-R315.5 compliance required.',
    },
    {
        id: 'co-alarm-obstructed',
        category: 'Carbon Monoxide Alarm',
        deficiencySelected: 'Carbon monoxide alarm is obstructed.',
        deficiencyDetail: 'Carbon monoxide alarm is obstructed.',
        deficiencyCriteria: 'Alarm covered by foreign object (plastic bag, shower cap, zip tie, paint, tape, stickers).',
        codeCompliance: 'Remove obstruction for proper operation.',
    },

    // Ceiling
    {
        id: 'ceiling-inadequate',
        category: 'Ceiling',
        deficiencySelected: 'The ceiling component(s) is not functionally adequate.',
        deficiencyDetail: 'Ceiling component is not functionally adequate. Water infiltration evaluated under Leak Water.',
        deficiencyCriteria: 'Does not allow ceiling to enclose room, protect shaft, create separation between spaces.',
        codeCompliance: `1. Visual Assessment - Scan for sagging, bubbling, cracks, loose panels
2. Damage & Penetrations - Document holes compromising fire separation (IRC §R302.6)
3. Moisture & Mold - Look for discoloration, musty odors
4. Fire Safety - Check sprinkler heads, smoke detectors (IRC §R302.11)
5. Lighting & Electrical - Verify secure mounting, no exposed wiring
6. Accessibility - Ceiling height ≥7 feet (IRC §R305.1)`,
    },
    {
        id: 'ceiling-hole',
        category: 'Ceiling',
        deficiencySelected: 'Ceiling has a hole.',
        deficiencyDetail: 'Hole opens directly to outside environment. OR Hole is 2 inches or greater in diameter.',
        deficiencyCriteria: 'Opens directly to outside light or damaged opening >2".',
        codeCompliance: 'Must maintain fire separation and structural integrity.',
    },
    {
        id: 'ceiling-unstable',
        category: 'Ceiling',
        deficiencySelected: 'The ceiling has an unstable surface (bulging, buckling).',
        deficiencyDetail: 'Cracking and/or nail pops on ceiling showing plasterboard pulling away.',
        deficiencyCriteria: 'Unstable surfaces - drywall, gypsum, tiles missing/detached, bubbling, loose panels.',
        codeCompliance: 'Evaluate water infiltration under Leak Water category if applicable.',
    },

    // Chimney/Flue
    {
        id: 'chimney-damaged',
        category: 'Chimney/Flue',
        deficiencySelected: 'Visually accessible and observed.',
        deficiencyDetail: 'Chimney, flue, or firebox is incomplete or damaged, may not safely contain fire.',
        deficiencyCriteria: 'Fireplace or fire burning appliance is not intentionally decommissioned.',
        codeCompliance: `1. Visual Identification - Locate chimney, identify type (masonry/metal)
2. Structural Integrity - Check for leaning, separation, cracked masonry
3. Containment & Venting - Inspect for cracks, holes, creosote stains
4. Clearances (IRC §R1001.11, §R1003.18):
   - Chimney ≥3 feet above roof
   - ≥2 feet above any point within 10 feet
5. Functional Components - Check cap, cleanout door, damper`,
    },

    // Dryer Exhaust
    {
        id: 'dryer-duct-material',
        category: 'Dryer Exhaust',
        deficiencySelected: 'Dryer transition duct is constructed of unsuitable material.',
        deficiencyDetail: 'Dryer transition duct is not constructed of metal or approved material.',
        deficiencyCriteria: 'Dryer is being used indoor.',
        codeCompliance: `1. Identify System Type - Electric or gas dryer, vent type
2. Transition Duct - Must be UL-listed metal or aluminum (no plastic/foil)
3. Airflow Check - Look for lint buildup, test airflow
4. Exterior Vent (IRC §M1502.3) - ≥3 feet from openings, no screens
5. Fire Safety (IRC):
   - Max 35 feet duct length (§M1502.4.6)
   - Mechanically fastened joints (§M1502.4.2)
   - Independent exhaust system (§M1502.2)`,
    },
    {
        id: 'electric-dryer-restricted',
        category: 'Dryer Exhaust',
        deficiencySelected: 'Electrical dryer exhaust ventilation has restricted airflow.',
        deficiencyDetail: 'Electric dryer exhaust ventilation system is blocked or damaged.',
        deficiencyCriteria: 'Airflow may be restricted.',
        codeCompliance: 'Check for lint buildup, damaged ductwork, blocked exterior vent.',
    },
    {
        id: 'electric-dryer-detached',
        category: 'Dryer Exhaust',
        deficiencySelected: 'Electric dryer transition duct is detached or missing.',
        deficiencyDetail: 'Electric dryer transition duct is detached or missing (evidence of prior installation).',
        deficiencyCriteria: 'Dryer transition duct is not securely attached.',
        codeCompliance: 'Verify secure connection at both ends.',
    },
    {
        id: 'gas-dryer-restricted',
        category: 'Dryer Exhaust',
        deficiencySelected: 'Gas dryer exhaust ventilation system has restricted airflow.',
        deficiencyDetail: 'Gas dryer exhaust ventilation system is blocked or damaged.',
        deficiencyCriteria: 'Airflow may be restricted.',
        codeCompliance: 'Critical for gas dryers - CO exposure risk.',
    },
    {
        id: 'gas-dryer-detached',
        category: 'Dryer Exhaust',
        deficiencySelected: 'Gas dryer transition duct is detached or missing',
        deficiencyDetail: 'Gas dryer transition duct is detached or missing (evidence of prior installation).',
        deficiencyCriteria: 'Dryer transition duct is not securely attached.',
        codeCompliance: 'Critical safety issue for gas dryers.',
    },

    // Entry Door
    {
        id: 'entry-door-unsecured',
        category: 'Door - Entry',
        deficiencySelected: 'Entry door cannot be secured.',
        deficiencyDetail: 'Entry door cannot be secured by at least one installed lock.',
        deficiencyCriteria: 'Installed locks cannot be engaged from both sides.',
        codeCompliance: `1. Door Functionality - Confirm opens/closes fully
2. Security & Hardware - Lock must work without excessive force
3. Physical Condition - Check for holes, splits, cracks, delamination
4. Weatherproofing - Inspect gaskets for gaps >¼"
5. Fire-Rated Assembly (IRC §R302.5) - Check label, self-closing mechanism
6. Accessibility - Min 32" clear opening (IRC §R311.2), handle 34-48" AFF`,
    },
    {
        id: 'entry-door-component-damaged',
        category: 'Door - Entry',
        deficiencySelected: 'Entry door component is damaged, inoperable or missing.',
        deficiencyDetail: 'Entry door component does not limit door\'s ability to provide privacy or protection.',
        deficiencyCriteria: 'Hole ¼" or greater, split/crack ¼" or greater penetrating through door.',
        codeCompliance: 'Evaluate impact on privacy and weather protection.',
    },
    {
        id: 'entry-door-frame-damaged',
        category: 'Door - Entry',
        deficiencySelected: 'The entry door frame, threshold, or trim is damaged.',
        deficiencyDetail: 'Entry door frame, threshold, or trim is damaged or missing.',
        deficiencyCriteria: 'Observed evidence of prior installation, now missing.',
        codeCompliance: 'Check for impact on functionality.',
    },
    {
        id: 'entry-door-missing',
        category: 'Door - Entry',
        deficiencySelected: 'Entry door is missing',
        deficiencyDetail: 'Evidence of prior installation.',
        deficiencyCriteria: 'Not present or is incomplete.',
        codeCompliance: 'Critical security deficiency.',
    },
    {
        id: 'entry-door-seal-damaged',
        category: 'Door - Entry',
        deficiencySelected: 'Entry door seal, gasket, or stripping is damaged, inoperable or missing.',
        deficiencyDetail: 'Entry door seal, gasket, or stripping is damaged, inoperable, or missing.',
        deficiencyCriteria: 'Gap of ¼" or more allowing light through or evidence of water penetration.',
        codeCompliance: 'Check for drafts, water damage, dry rot.',
    },
    {
        id: 'entry-door-self-closing-damaged',
        category: 'Door - Entry',
        deficiencySelected: 'Self-closing mechanism is damaged, inoperable or damaged.',
        deficiencyDetail: 'Self-closing mechanism is damaged, does not pull door closed, or is missing.',
        deficiencyCriteria: 'Must pull door closed and engage latch.',
        codeCompliance: 'Required for fire-rated doors.',
    },
    {
        id: 'entry-door-delaminated',
        category: 'Door - Entry',
        deficiencySelected: 'Entry door surface is delaminated or separated.',
        deficiencyDetail: 'Delamination or separation of door surface 2 inches wide or greater.',
        deficiencyCriteria: 'Affects integrity of the door.',
        codeCompliance: 'Evaluate structural impact.',
    },
    {
        id: 'entry-door-wont-close',
        category: 'Door - Entry',
        deficiencySelected: 'Entry door will not close.',
        deficiencyDetail: 'Entry door does not close (door seats in frame).',
        deficiencyCriteria: 'Door must close and latch properly.',
        codeCompliance: 'Security and fire safety issue.',
    },
    {
        id: 'entry-door-wont-open',
        category: 'Door - Entry',
        deficiencySelected: 'Entry door will not open.',
        deficiencyDetail: 'Entry door does not open.',
        deficiencyCriteria: 'Must open for egress.',
        codeCompliance: 'Life safety egress issue.',
    },
    {
        id: 'entry-door-hole',
        category: 'Door - Entry',
        deficiencySelected: 'Hole, split, or crack that penetrates completely through the entry door.',
        deficiencyDetail: 'Crack, split, separation, or hole 1/4" or greater penetrating through door.',
        deficiencyCriteria: 'Compromises security and weatherproofing.',
        codeCompliance: 'Replace or repair door.',
    },

    // Fire-Labeled Door
    {
        id: 'fire-door-obstructed',
        category: 'Door - Fire Labeled',
        deficiencySelected: 'An object is present that may prevent the fire-labeled door from closing and latching.',
        deficiencyDetail: 'Object prevents fire-labeled door from closing/latching or self-closing/latching.',
        deficiencyCriteria: 'Door must be able to close and latch automatically.',
        codeCompliance: `1. Door Identification - Look for fire label on door edge or frame
2. Operability - Must open fully and close/latch securely
3. Self-Closing Hardware - Required, must function without manual assistance
4. Structural Integrity - No holes, ≥25% rust = Severe, broken glass = Severe
5. Seal Condition - Check for missing/torn fire-rated seals
6. Obstructions - No wedges, trash cans, or kick-down stops allowed`,
    },
    {
        id: 'fire-door-hole',
        category: 'Door - Fire Labeled',
        deficiencySelected: 'Fire-labeled door assembly has a hole of any size.',
        deficiencyDetail: 'Fire-labeled door has a hole of any size or is damaged affecting integrity.',
        deficiencyCriteria: 'Any compromise to fire containment.',
        codeCompliance: 'Severe deficiency - compromises fire rating.',
    },
    {
        id: 'fire-door-unsecured',
        category: 'Door - Fire Labeled',
        deficiencySelected: 'Fire-labeled door cannot be secured.',
        deficiencyDetail: 'Fire-labeled entry door cannot be secured by at least one installed lock.',
        deficiencyCriteria: 'Must have functional lock.',
        codeCompliance: 'Combined fire and security deficiency.',
    },
    {
        id: 'fire-door-damaged',
        category: 'Door - Fire Labeled',
        deficiencySelected: 'Fire-labeled door does not close and latch. OR is damaged or missing.',
        deficiencyDetail: 'Fire-labeled door does not close/latch or is damaged/missing.',
        deficiencyCriteria: 'Door integrity may be compromised.',
        codeCompliance: 'Critical fire safety deficiency.',
    },
];

/**
 * Get unique categories for grouping
 * @returns {string[]} Sorted array of unique categories
 */
const getDeficiencyCategories = () => {
    const categories = [...new Set(DEFICIENCY_DATA.map(d => d.category))];
    return categories.sort();
};

/**
 * Search deficiencies by query
 * @param {string} query - Search query
 * @returns {Array} Matching deficiencies
 */
const searchDeficiencies = (query) => {
    const lowerQuery = query.toLowerCase();
    return DEFICIENCY_DATA.filter(d =>
        d.deficiencySelected.toLowerCase().includes(lowerQuery) ||
        d.category.toLowerCase().includes(lowerQuery) ||
        d.deficiencyDetail.toLowerCase().includes(lowerQuery)
    );
};

/**
 * Get deficiencies by category
 * @param {string} category - Category name
 * @returns {Array} Matching deficiencies
 */
const getDeficienciesByCategory = (category) => {
    return DEFICIENCY_DATA.filter(d => d.category === category);
};

/**
 * Get deficiency by ID
 * @param {string} id - Deficiency ID
 * @returns {Object|undefined} Deficiency object or undefined
 */
const getDeficiencyById = (id) => {
    return DEFICIENCY_DATA.find(d => d.id === id);
};

module.exports = {
    INSIDE_LOCATIONS,
    OUTSIDE_LOCATIONS,
    DEFICIENCY_DATA,
    getDeficiencyCategories,
    searchDeficiencies,
    getDeficienciesByCategory,
    getDeficiencyById,
};
