/**
 * Unit catalog. Every unit converts to its category's base unit as
 * `base = (value + offset) * factor`. Factors are exact decimal strings taken from
 * SI / NIST SP 811 definitions; `a/b` denotes an exact ratio evaluated in decimal arithmetic.
 */

export const CATEGORIES = [
  'length',
  'mass',
  'temperature',
  'area',
  'volume',
  'speed',
  'time',
  'energy',
  'power',
  'pressure',
  'data',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const BASE_UNITS: Record<Category, string> = {
  length: 'm',
  mass: 'kg',
  temperature: 'K',
  area: 'm²',
  volume: 'm³',
  speed: 'm/s',
  time: 's',
  energy: 'J',
  power: 'W',
  pressure: 'Pa',
  data: 'B',
};

export interface UnitDef {
  /** Canonical symbol returned in outputs. */
  id: string;
  name: string;
  category: Category;
  factor: string;
  offset?: string;
  aliases: readonly string[];
}

type Row = [id: string, name: string, factor: string, aliases: string[], offset?: string];

const table: Record<Category, Row[]> = {
  length: [
    ['nm', 'nanometre', '1e-9', ['nanometer', 'nanometre', 'nanometers', 'nanometres']],
    ['µm', 'micrometre', '1e-6', ['um', 'micron', 'microns', 'micrometer', 'micrometre', 'micrometers', 'micrometres']],
    ['mm', 'millimetre', '0.001', ['millimeter', 'millimetre', 'millimeters', 'millimetres']],
    ['cm', 'centimetre', '0.01', ['centimeter', 'centimetre', 'centimeters', 'centimetres']],
    ['dm', 'decimetre', '0.1', ['decimeter', 'decimetre', 'decimeters', 'decimetres']],
    ['m', 'metre', '1', ['meter', 'metre', 'meters', 'metres']],
    ['km', 'kilometre', '1000', ['kilometer', 'kilometre', 'kilometers', 'kilometres']],
    ['in', 'inch', '0.0254', ['inch', 'inches', '"', '″']],
    ['ft', 'foot', '0.3048', ['foot', 'feet', "'", '′']],
    ['yd', 'yard', '0.9144', ['yard', 'yards']],
    ['mi', 'mile (statute)', '1609.344', ['mile', 'miles', 'statute mile', 'statute miles']],
    ['nmi', 'nautical mile', '1852', ['nautical mile', 'nautical miles', 'NM']],
    ['mil', 'thou (1/1000 inch)', '0.0000254', ['thou', 'mils']],
    ['au', 'astronomical unit', '149597870700', ['AU', 'astronomical unit', 'astronomical units']],
    ['ly', 'light-year', '9460730472580800', ['light year', 'light years', 'light-year', 'light-years', 'lightyear']],
  ],
  mass: [
    ['µg', 'microgram', '1e-9', ['ug', 'mcg', 'microgram', 'micrograms']],
    ['mg', 'milligram', '0.000001', ['milligram', 'milligrams']],
    ['g', 'gram', '0.001', ['gram', 'grams', 'gramme', 'grammes']],
    ['kg', 'kilogram', '1', ['kilogram', 'kilograms', 'kilo', 'kilos', 'kgs']],
    ['t', 'tonne (metric ton)', '1000', ['tonne', 'tonnes', 'metric ton', 'metric tons', 'metric tonne']],
    ['ct', 'carat', '0.0002', ['carat', 'carats']],
    ['gr', 'grain', '0.00006479891', ['grain', 'grains']],
    ['oz', 'ounce (avoirdupois)', '0.028349523125', ['ounce', 'ounces']],
    ['ozt', 'troy ounce', '0.0311034768', ['troy ounce', 'troy ounces', 'oz t', 'ozt.']],
    ['lb', 'pound (avoirdupois)', '0.45359237', ['lbs', 'pound', 'pounds', 'lbm']],
    ['st', 'stone', '6.35029318', ['stone', 'stones']],
    ['ton_us', 'short ton (US)', '907.18474', ['short ton', 'short tons', 'US ton', 'US tons']],
    ['ton_uk', 'long ton (UK)', '1016.0469088', ['long ton', 'long tons', 'UK ton', 'imperial ton']],
  ],
  temperature: [
    ['K', 'kelvin', '1', ['kelvin', 'kelvins', '°K', 'degK']],
    ['°C', 'degree Celsius', '1', ['C', 'degC', 'deg C', 'celsius', 'centigrade', 'degree celsius', 'degrees celsius'], '273.15'],
    ['°F', 'degree Fahrenheit', '5/9', ['F', 'degF', 'deg F', 'fahrenheit', 'degree fahrenheit', 'degrees fahrenheit'], '459.67'],
    ['°R', 'degree Rankine', '5/9', ['R', 'degR', 'rankine']],
  ],
  area: [
    ['mm²', 'square millimetre', '0.000001', ['mm2', 'sq mm', 'square millimeter', 'square millimeters']],
    ['cm²', 'square centimetre', '0.0001', ['cm2', 'sq cm', 'square centimeter', 'square centimeters']],
    ['m²', 'square metre', '1', ['m2', 'sq m', 'sqm', 'square meter', 'square meters', 'square metre', 'square metres']],
    ['a', 'are', '100', ['are', 'ares']],
    ['ha', 'hectare', '10000', ['hectare', 'hectares']],
    ['km²', 'square kilometre', '1000000', ['km2', 'sq km', 'square kilometer', 'square kilometers']],
    ['in²', 'square inch', '0.00064516', ['in2', 'sq in', 'square inch', 'square inches']],
    ['ft²', 'square foot', '0.09290304', ['ft2', 'sq ft', 'sqft', 'square foot', 'square feet']],
    ['yd²', 'square yard', '0.83612736', ['yd2', 'sq yd', 'square yard', 'square yards']],
    ['ac', 'acre', '4046.8564224', ['acre', 'acres']],
    ['mi²', 'square mile', '2589988.110336', ['mi2', 'sq mi', 'square mile', 'square miles']],
  ],
  volume: [
    ['mm³', 'cubic millimetre', '1e-9', ['mm3', 'cubic millimeter', 'cubic millimeters']],
    ['mL', 'millilitre', '0.000001', ['ml', 'cm³', 'cm3', 'cc', 'millilitre', 'milliliter', 'millilitres', 'milliliters']],
    ['cL', 'centilitre', '0.00001', ['cl', 'centilitre', 'centiliter', 'centilitres', 'centiliters']],
    ['dL', 'decilitre', '0.0001', ['dl', 'decilitre', 'deciliter', 'decilitres', 'deciliters']],
    ['L', 'litre', '0.001', ['l', 'litre', 'liter', 'litres', 'liters', 'dm³', 'dm3']],
    ['m³', 'cubic metre', '1', ['m3', 'cubic meter', 'cubic meters', 'cubic metre', 'cubic metres']],
    ['km³', 'cubic kilometre', '1000000000', ['km3', 'cubic kilometer', 'cubic kilometers']],
    ['in³', 'cubic inch', '0.000016387064', ['in3', 'cu in', 'cubic inch', 'cubic inches']],
    ['ft³', 'cubic foot', '0.028316846592', ['ft3', 'cu ft', 'cubic foot', 'cubic feet']],
    ['yd³', 'cubic yard', '0.764554857984', ['yd3', 'cu yd', 'cubic yard', 'cubic yards']],
    ['tsp_us', 'US teaspoon', '0.00000492892159375', ['US teaspoon', 'US teaspoons']],
    ['tbsp_us', 'US tablespoon', '0.00001478676478125', ['US tablespoon', 'US tablespoons']],
    ['floz_us', 'US fluid ounce', '0.0000295735295625', ['fl oz US', 'US fl oz', 'US fluid ounce', 'US fluid ounces']],
    ['cup_us', 'US customary cup', '0.0002365882365', ['US cup', 'US cups']],
    ['pt_us', 'US liquid pint', '0.000473176473', ['US pint', 'US pints']],
    ['qt_us', 'US liquid quart', '0.000946352946', ['US quart', 'US quarts']],
    ['gal_us', 'US gallon', '0.003785411784', ['US gallon', 'US gallons', 'usgal']],
    ['floz_imp', 'imperial fluid ounce', '0.0000284130625', ['imperial fl oz', 'UK fl oz', 'imperial fluid ounce']],
    ['pt_imp', 'imperial pint', '0.00056826125', ['imperial pint', 'UK pint', 'imperial pints', 'UK pints']],
    ['qt_imp', 'imperial quart', '0.0011365225', ['imperial quart', 'UK quart']],
    ['gal_imp', 'imperial gallon', '0.00454609', ['imperial gallon', 'imperial gallons', 'UK gallon', 'UK gallons']],
    ['bbl', 'oil barrel', '0.158987294928', ['barrel', 'barrels', 'oil barrel', 'oil barrels']],
  ],
  speed: [
    ['m/s', 'metre per second', '1', ['mps', 'meters per second', 'metres per second', 'meter per second', 'm s-1']],
    ['km/h', 'kilometre per hour', '1000/3600', ['kph', 'kmh', 'km/hr', 'kmph', 'kilometers per hour', 'kilometres per hour', 'kilometer per hour']],
    ['mph', 'mile per hour', '0.44704', ['mi/h', 'mi/hr', 'miles per hour', 'mile per hour']],
    ['kn', 'knot', '1852/3600', ['kt', 'kts', 'knot', 'knots']],
    ['ft/s', 'foot per second', '0.3048', ['fps', 'feet per second', 'foot per second']],
  ],
  time: [
    ['ns', 'nanosecond', '1e-9', ['nanosecond', 'nanoseconds']],
    ['µs', 'microsecond', '0.000001', ['us', 'microsecond', 'microseconds']],
    ['ms', 'millisecond', '0.001', ['millisecond', 'milliseconds', 'msec']],
    ['s', 'second', '1', ['sec', 'secs', 'second', 'seconds']],
    ['min', 'minute', '60', ['mins', 'minute', 'minutes']],
    ['h', 'hour', '3600', ['hr', 'hrs', 'hour', 'hours']],
    ['d', 'day (86400 s)', '86400', ['day', 'days']],
    ['wk', 'week', '604800', ['week', 'weeks']],
    ['month_30', '30-day month', '2592000', ['30-day month']],
    ['month_avg', 'average Gregorian month (30.436875 d)', '2629746', ['average month', 'gregorian month']],
    ['year_365', 'common year (365 d)', '31536000', ['common year']],
    ['year_julian', 'Julian year (365.25 d)', '31557600', ['julian year']],
    ['year_avg', 'average Gregorian year (365.2425 d)', '31556952', ['gregorian year', 'average year']],
  ],
  energy: [
    ['J', 'joule', '1', ['joule', 'joules']],
    ['kJ', 'kilojoule', '1000', ['kilojoule', 'kilojoules']],
    ['MJ', 'megajoule', '1000000', ['megajoule', 'megajoules']],
    ['GJ', 'gigajoule', '1000000000', ['gigajoule', 'gigajoules']],
    ['Wh', 'watt-hour', '3600', ['watt hour', 'watt hours', 'watt-hour', 'watt-hours']],
    ['kWh', 'kilowatt-hour', '3600000', ['kilowatt hour', 'kilowatt hours', 'kilowatt-hour', 'kilowatt-hours', 'kwh']],
    ['MWh', 'megawatt-hour', '3600000000', ['megawatt hour', 'megawatt hours', 'megawatt-hour']],
    ['cal', 'thermochemical calorie', '4.184', ['calorie', 'calories', 'cal_th', 'small calorie']],
    ['cal_it', 'International Table calorie', '4.1868', ['IT calorie']],
    ['kcal', 'kilocalorie (food Calorie)', '4184', ['Cal', 'kilocalorie', 'kilocalories', 'food calorie', 'food calories']],
    ['BTU', 'British thermal unit (IT)', '1055.05585262', ['btu', 'Btu', 'british thermal unit', 'british thermal units']],
    ['therm', 'therm (US)', '105480400', ['therms', 'thm']],
    ['eV', 'electronvolt', '1.602176634e-19', ['electronvolt', 'electronvolts', 'electron volt', 'electron volts']],
    ['erg', 'erg', '1e-7', ['ergs']],
    ['ft·lbf', 'foot-pound force', '1.3558179483314004', ['ft.lbf', 'ft-lbf', 'ftlbf', 'ft lbf', 'foot-pound', 'foot pound', 'foot-pounds', 'foot pounds']],
  ],
  power: [
    ['mW', 'milliwatt', '0.001', ['milliwatt', 'milliwatts']],
    ['W', 'watt', '1', ['watt', 'watts']],
    ['kW', 'kilowatt', '1000', ['kilowatt', 'kilowatts', 'kw']],
    ['MW', 'megawatt', '1000000', ['megawatt', 'megawatts']],
    ['GW', 'gigawatt', '1000000000', ['gigawatt', 'gigawatts']],
    ['hp', 'mechanical horsepower (550 ft·lbf/s)', '745.69987158227022', ['horsepower', 'bhp', 'hp_mech', 'hp(I)']],
    ['hp_metric', 'metric horsepower (PS)', '735.49875', ['PS', 'metric horsepower', 'cv', 'CV', 'ch']],
    ['hp_electric', 'electrical horsepower', '746', ['electrical horsepower']],
    ['BTU/h', 'BTU per hour', '1055.05585262/3600', ['btu/h', 'BTU/hr', 'btu/hr', 'Btu/h']],
  ],
  pressure: [
    ['Pa', 'pascal', '1', ['pascal', 'pascals', 'N/m²', 'N/m2']],
    ['hPa', 'hectopascal', '100', ['hectopascal', 'hectopascals']],
    ['kPa', 'kilopascal', '1000', ['kilopascal', 'kilopascals']],
    ['MPa', 'megapascal', '1000000', ['megapascal', 'megapascals']],
    ['GPa', 'gigapascal', '1000000000', ['gigapascal', 'gigapascals']],
    ['bar', 'bar', '100000', ['bars']],
    ['mbar', 'millibar', '100', ['millibar', 'millibars', 'mb']],
    ['atm', 'standard atmosphere', '101325', ['atmosphere', 'atmospheres']],
    ['psi', 'pound-force per square inch', '6894.757293168361', ['lbf/in²', 'lbf/in2', 'pounds per square inch']],
    ['ksi', 'kilopound per square inch', '6894757.293168361', ['kpsi']],
    ['Torr', 'torr', '101325/760', ['torr']],
    ['mmHg', 'millimetre of mercury', '133.322387415', ['mm Hg', 'millimeters of mercury', 'millimetres of mercury']],
    ['inHg', 'inch of mercury', '3386.389', ['in Hg', 'inches of mercury']],
  ],
  data: [
    ['bit', 'bit', '0.125', ['bits', 'b']],
    ['B', 'byte', '1', ['byte', 'bytes', 'octet', 'octets']],
    ['kbit', 'kilobit (1000 bit)', '125', ['kb', 'kilobit', 'kilobits']],
    ['Mbit', 'megabit', '125000', ['Mb', 'megabit', 'megabits']],
    ['Gbit', 'gigabit', '125000000', ['Gb', 'gigabit', 'gigabits']],
    ['Tbit', 'terabit', '125000000000', ['Tb', 'terabit', 'terabits']],
    ['kB', 'kilobyte (1000 B)', '1000', ['kilobyte', 'kilobytes']],
    ['MB', 'megabyte (10^6 B)', '1000000', ['megabyte', 'megabytes']],
    ['GB', 'gigabyte (10^9 B)', '1000000000', ['gigabyte', 'gigabytes']],
    ['TB', 'terabyte (10^12 B)', '1000000000000', ['terabyte', 'terabytes']],
    ['PB', 'petabyte (10^15 B)', '1000000000000000', ['petabyte', 'petabytes']],
    ['KiB', 'kibibyte (1024 B)', '1024', ['kibibyte', 'kibibytes']],
    ['MiB', 'mebibyte (1024^2 B)', '1048576', ['mebibyte', 'mebibytes']],
    ['GiB', 'gibibyte (1024^3 B)', '1073741824', ['gibibyte', 'gibibytes']],
    ['TiB', 'tebibyte (1024^4 B)', '1099511627776', ['tebibyte', 'tebibytes']],
    ['PiB', 'pebibyte (1024^5 B)', '1125899906842624', ['pebibyte', 'pebibytes']],
  ],
};

/**
 * Symbols that are commonly used for several different units. They are never resolved
 * silently; the caller gets INVALID_UNIT with the exact alternatives.
 */
export const AMBIGUOUS: Record<string, readonly string[]> = {
  gal: ['gal_us', 'gal_imp'],
  gallon: ['gal_us', 'gal_imp'],
  gallons: ['gal_us', 'gal_imp'],
  pt: ['pt_us', 'pt_imp'],
  pint: ['pt_us', 'pt_imp'],
  pints: ['pt_us', 'pt_imp'],
  qt: ['qt_us', 'qt_imp'],
  quart: ['qt_us', 'qt_imp'],
  quarts: ['qt_us', 'qt_imp'],
  'fl oz': ['floz_us', 'floz_imp'],
  floz: ['floz_us', 'floz_imp'],
  'fluid ounce': ['floz_us', 'floz_imp'],
  'fluid ounces': ['floz_us', 'floz_imp'],
  cup: ['cup_us', 'mL'],
  cups: ['cup_us', 'mL'],
  tsp: ['tsp_us', 'mL'],
  teaspoon: ['tsp_us', 'mL'],
  tbsp: ['tbsp_us', 'mL'],
  tablespoon: ['tbsp_us', 'mL'],
  ton: ['t', 'ton_us', 'ton_uk'],
  tons: ['t', 'ton_us', 'ton_uk'],
  KB: ['kB', 'KiB'],
  month: ['month_30', 'month_avg'],
  months: ['month_30', 'month_avg'],
  mo: ['month_30', 'month_avg'],
  year: ['year_365', 'year_julian', 'year_avg'],
  years: ['year_365', 'year_julian', 'year_avg'],
  yr: ['year_365', 'year_julian', 'year_avg'],
  y: ['year_365', 'year_julian', 'year_avg'],
};

export const UNITS: readonly UnitDef[] = Object.freeze(
  CATEGORIES.flatMap((category) =>
    table[category].map(([id, name, factor, aliases, offset]) =>
      Object.freeze({ id, name, category, factor, aliases: Object.freeze(aliases), ...(offset ? { offset } : {}) }),
    ),
  ),
);
