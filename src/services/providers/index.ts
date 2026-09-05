import { ElectricityProvider } from './ElectricityProvider';
import { SquadProvider } from './SquadProvider';
import { MockElectricityProvider } from './MockElectricityProvider';
import { VTpassProvider } from './VTpassProvider';
import { NIGERIAN_DISCOS } from './discoMapping';

export * from './ElectricityProvider';
export * from './SquadProvider';
export * from './discoMapping';
export * from './MockElectricityProvider';
export { VTpassProvider } from './VTpassProvider';

export class ElectricityProviderFactory {
  private static providers: Map<string, ElectricityProvider> = new Map();
  private static defaultProviderName: string =
    process.env.EXPO_PUBLIC_ELECTRICITY_PROVIDER?.toLowerCase() ||
    process.env.ELECTRICITY_PROVIDER?.toLowerCase() ||
    'squad';

  static registerProvider(name: string, provider: ElectricityProvider) {
    this.providers.set(name.toLowerCase(), provider);
  }

  static setDefaultProviderName(name: string) {
    this.defaultProviderName = name.toLowerCase();
  }

  static getProvider(name: string = this.defaultProviderName): ElectricityProvider {
    const key = name.toLowerCase();
    if (!this.providers.has(key)) {
      if (key === 'squad') {
        this.providers.set(key, new SquadProvider());
      } else if (key === 'mock') {
        this.providers.set(key, new MockElectricityProvider());
      } else if (key === 'vtpass') {
        this.providers.set(key, new VTpassProvider());
      } else {
        throw new Error(`Unsupported electricity provider: ${name}`);
      }
    }
    return this.providers.get(key)!;
  }

  static getDefaultProvider(): ElectricityProvider {
    return this.getProvider(this.defaultProviderName);
  }

  static getSupportedDiscos() {
    return NIGERIAN_DISCOS;
  }

  static reset() {
    this.providers.clear();
    this.defaultProviderName =
      process.env.EXPO_PUBLIC_ELECTRICITY_PROVIDER?.toLowerCase() ||
      process.env.ELECTRICITY_PROVIDER?.toLowerCase() ||
      'squad';
  }
}


