import { ElectricityProvider } from './ElectricityProvider';
import { VTpassProvider, NIGERIAN_DISCOS } from './VTpassProvider';
import { MockElectricityProvider } from './MockElectricityProvider';

export * from './ElectricityProvider';
export * from './VTpassProvider';
export * from './MockElectricityProvider';

export class ElectricityProviderFactory {
  private static providers: Map<string, ElectricityProvider> = new Map();
  private static defaultProviderName: string = 'vtpass';

  static registerProvider(name: string, provider: ElectricityProvider) {
    this.providers.set(name.toLowerCase(), provider);
  }

  static setDefaultProviderName(name: string) {
    this.defaultProviderName = name.toLowerCase();
  }

  static getProvider(name: string = this.defaultProviderName): ElectricityProvider {
    const key = name.toLowerCase();
    if (!this.providers.has(key)) {
      if (key === 'vtpass') {
        this.providers.set(key, new VTpassProvider());
      } else if (key === 'mock') {
        this.providers.set(key, new MockElectricityProvider());
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
    this.defaultProviderName = 'vtpass';
  }
}
