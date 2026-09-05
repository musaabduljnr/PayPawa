import type { DiscoInfo } from './ElectricityProvider';

/**
 * Standard DISCO Directory across Nigeria with official Squad branding & codes
 */
export const NIGERIAN_DISCOS: DiscoInfo[] = [
  {
    code: 'ie',
    name: 'Ikeja Electricity',
    shortName: 'IE',
    serviceID: 'IE',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'ekedc',
    name: 'Eko Electricity Distribution Company',
    shortName: 'EKEDC',
    serviceID: 'EKEDC',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'aedc',
    name: 'Abuja Electricity Distribution Company',
    shortName: 'AEDC',
    serviceID: 'AEDC',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'yedc',
    name: 'Yola Electricity Distribution Company',
    shortName: 'YEDC',
    serviceID: 'YEDC',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'bedc',
    name: 'Benin Electricity Distribution Company',
    shortName: 'BEDC',
    serviceID: 'BEDC',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'ibedc',
    name: 'Ibadan Electricity Distribution Company',
    shortName: 'IBEDC',
    serviceID: 'IBEDC',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'kedco',
    name: 'Kano Electricity Distribution Company',
    shortName: 'KEDCO',
    serviceID: 'KEDCO',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'kaedco',
    name: 'Kaduna Electricity Distribution Company',
    shortName: 'KAEDC',
    serviceID: 'KAEDC',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'phed',
    name: 'Port Harcourt Electricity Distribution Company',
    shortName: 'PHED',
    serviceID: 'PHED',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'eedc',
    name: 'Enugu Electricity Distribution Company',
    shortName: 'EEDC',
    serviceID: 'EEDC',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'jed',
    name: 'Jos Electricity Distribution Company',
    shortName: 'JED',
    serviceID: 'JED',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
];

export const SQUAD_DISCO_MAP: Record<string, string> = {
  // Ikeja Electric
  ikedc: 'IE',
  ie: 'IE',
  'ikeja-electric': 'IE',
  'ikeja electricity': 'IE',

  // Eko Electricity
  ekedc: 'EKEDC',
  'eko-electric': 'EKEDC',
  'eko electricity': 'EKEDC',

  // Abuja Electricity
  aedc: 'AEDC',
  'abuja-electric': 'AEDC',
  'abuja electricity': 'AEDC',

  // Yola Electricity
  yedc: 'YEDC',
  'yola-electric': 'YEDC',
  'yola electricity': 'YEDC',

  // Benin Electricity
  bedc: 'BEDC',
  'benin-electric': 'BEDC',
  'benin electricity': 'BEDC',

  // Ibadan Electricity
  ibedc: 'IBEDC',
  'ibadan-electric': 'IBEDC',
  'ibadan electricity': 'IBEDC',

  // Kano Electricity
  kedco: 'KEDCO',
  'kano-electric': 'KEDCO',
  'kano electricity': 'KEDCO',

  // Kaduna Electricity
  kaedco: 'KAEDC',
  kaedc: 'KAEDC',
  'kaduna-electric': 'KAEDC',
  'kaduna electricity': 'KAEDC',

  // Port Harcourt Electricity
  phed: 'PHED',
  'portharcourt-electric': 'PHED',
  'port harcourt electricity': 'PHED',

  // Enugu Electricity
  eedc: 'EEDC',
  'enugu-electric': 'EEDC',
  'enugu electricity': 'EEDC',

  // Jos Electricity
  jed: 'JED',
  jedc: 'JED',
  'jos-electric': 'JED',
  'jos electricity': 'JED',
};

/**
 * Normalizes any incoming DISCO identifier to the official Squad provider code.
 * Defaults to uppercase string if no mapping matches.
 */
export function normalizeToSquadDisco(rawCodeOrName: string): string {
  if (!rawCodeOrName) return 'AEDC';
  const clean = rawCodeOrName.trim().toLowerCase();
  return SQUAD_DISCO_MAP[clean] || rawCodeOrName.trim().toUpperCase();
}
