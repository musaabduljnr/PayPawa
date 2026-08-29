import { PaymentProvider } from './PaymentProvider';
import { PaystackPaymentProvider } from './PaystackPaymentProvider';
import { MockPaymentProvider } from './MockPaymentProvider';

export * from './PaymentProvider';
export * from './PaystackPaymentProvider';
export * from './MockPaymentProvider';

export class PaymentProviderFactory {
  private static providers: Map<string, PaymentProvider> = new Map();
  private static defaultProviderName: string = 'paystack';

  static {
    // Initialize default registered providers
    const paystack = new PaystackPaymentProvider();
    const mock = new MockPaymentProvider('SUCCESS');

    this.providers.set('paystack', paystack);
    this.providers.set('mock', mock);
  }

  static getProvider(name?: string): PaymentProvider {
    const providerName = name || this.defaultProviderName;
    const provider = this.providers.get(providerName);
    if (!provider) {
      return this.providers.get('paystack') || new PaystackPaymentProvider();
    }
    return provider;
  }

  static getDefaultProvider(): PaymentProvider {
    return this.getProvider(this.defaultProviderName);
  }

  static setDefaultProviderName(name: string): void {
    this.defaultProviderName = name;
  }

  static registerProvider(name: string, provider: PaymentProvider): void {
    this.providers.set(name, provider);
  }
}
