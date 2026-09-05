import {
  ElectricityProvider,
  DiscoInfo,
  VerifyMeterRequest,
  VerifyMeterResponse,
  VendTokenRequest,
  VendTokenResponse,
  QueryTransactionRequest,
  QueryTransactionResponse,
} from './ElectricityProvider';

/**
 * Standard DISCO Directory across Nigeria
 */
export const NIGERIAN_DISCOS: DiscoInfo[] = [
  {
    code: 'yedc',
    name: 'Yola Electricity Distribution Company',
    shortName: 'YEDC',
    serviceID: 'yola-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'aedc',
    name: 'Abuja Electricity Distribution Company',
    shortName: 'AEDC',
    serviceID: 'abuja-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'ekedc',
    name: 'Eko Electricity Distribution Company',
    shortName: 'EKEDC',
    serviceID: 'eko-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'ikedc',
    name: 'Ikeja Electric',
    shortName: 'IKEDC',
    serviceID: 'ikeja-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'ibedc',
    name: 'Ibadan Electricity Distribution Company',
    shortName: 'IBEDC',
    serviceID: 'ibadan-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'phed',
    name: 'Port Harcourt Electricity Distribution Company',
    shortName: 'PHED',
    serviceID: 'portharcourt-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'eedc',
    name: 'Enugu Electricity Distribution Company',
    shortName: 'EEDC',
    serviceID: 'enugu-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'kedco',
    name: 'Kano Electricity Distribution Company',
    shortName: 'KEDCO',
    serviceID: 'kano-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'kaedco',
    name: 'Kaduna Electricity Distribution Company',
    shortName: 'KAEDCO',
    serviceID: 'kaduna-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'jedc',
    name: 'Jos Electricity Distribution Company',
    shortName: 'JEDC',
    serviceID: 'jos-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
  {
    code: 'bedc',
    name: 'Benin Electricity Distribution Company',
    shortName: 'BEDC',
    serviceID: 'benin-electric',
    minAmountKobo: 50000,
    maxAmountKobo: 50000000,
    isAvailable: true,
  },
];

/**
 * VTpass Electricity Gateway Implementation
 * Handles normalization and live communication with the VTpass REST API.
 */
export class VTpassProvider implements ElectricityProvider {
  readonly providerName = 'vtpass';

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly publicKey: string;

  constructor(baseUrl?: string, apiKey?: string, secretKey?: string, publicKey?: string) {
    this.baseUrl =
      baseUrl ||
      process.env.EXPO_PUBLIC_VTPASS_BASE_URL ||
      process.env.VTPASS_BASE_URL ||
      'https://sandbox.vtpass.com/api';
    this.apiKey =
      apiKey ||
      process.env.EXPO_PUBLIC_VTPASS_API_KEY ||
      process.env.VTPASS_API_KEY ||
      '';
    this.secretKey =
      secretKey ||
      process.env.EXPO_PUBLIC_VTPASS_SECRET_KEY ||
      process.env.VTPASS_SECRET_KEY ||
      '';
    this.publicKey =
      publicKey ||
      process.env.EXPO_PUBLIC_VTPASS_PUBLIC_KEY ||
      process.env.VTPASS_PUBLIC_KEY ||
      '';
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }
    if (this.secretKey) {
      headers['secret-key'] = this.secretKey;
      headers['X-Secret'] = this.secretKey;
    }
    if (this.publicKey) {
      headers['public-key'] = this.publicKey;
      headers['X-Token'] = this.publicKey;
    }
    return headers;
  }

  private generateRequestId(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyymmddhhmm = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `${yyyymmddhhmm}${rand}`;
  }

  private formatTokenString(rawToken: string): string {
    const clean = rawToken.replace(/[^0-9]/g, '');
    if (clean.length === 20) {
      return clean.replace(/(\d{4})(?=\d)/g, '$1 ');
    }
    return rawToken.replace(/^Token\s*:\s*/i, '');
  }

  async getDiscos(): Promise<DiscoInfo[]> {
    return NIGERIAN_DISCOS;
  }

  async verifyMeter(request: VerifyMeterRequest): Promise<VerifyMeterResponse> {
    const disco = NIGERIAN_DISCOS.find(
      (d) =>
        d.code.toLowerCase() === request.discoCode.toLowerCase() ||
        d.shortName.toLowerCase() === request.discoCode.toLowerCase() ||
        request.discoCode.toLowerCase().includes(d.code.toLowerCase())
    );
    const sanitizedMeter = request.meterNumber.replace(/\s/g, '');

    if (!sanitizedMeter || sanitizedMeter.length < 8) {
      return {
        success: false,
        meterNumber: request.meterNumber,
        discoCode: request.discoCode,
        customerName: '',
        address: '',
        meterType: request.meterType,
        errorCode: 'INVALID_METER_NUMBER',
        errorMessage: 'Meter number must be between 8 and 13 digits.',
      };
    }

    const serviceID = disco?.serviceID || 'abuja-electric';
    const hasKeys = Boolean(this.apiKey || this.secretKey || this.publicKey);

    // If API keys are configured, make live HTTP call to VTpass
    if (hasKeys) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      try {
        const endpoint = `${this.baseUrl.replace(/\/$/, '')}/merchant-verify`;
        console.log(`[VTpass] Sending live verifyMeter request to ${endpoint} for ${sanitizedMeter} (${serviceID})`);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            billersCode: sanitizedMeter,
            serviceID,
            type: request.meterType || 'prepaid',
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await response.json();
        console.log('[VTpass] verifyMeter response status:', data?.code, data?.response_description || data?.content);

        if (data.code === '000' && data.content) {
          const customerName =
            data.content.Customer_Name ||
            data.content.customerName ||
            data.content.Name ||
            'Verified Customer';
          const address =
            data.content.Address ||
            data.content.address ||
            'Address on Record';
          const tariffCode =
            data.content.Service_Band ||
            data.content.Customer_Account_Type ||
            'R2-SinglePhase';

          return {
            success: true,
            meterNumber: sanitizedMeter,
            discoCode: disco?.code || request.discoCode,
            customerName,
            address,
            meterType: request.meterType,
            tariffCode,
            rawResponse: data,
          };
        }

        return {
          success: false,
          meterNumber: sanitizedMeter,
          discoCode: request.discoCode,
          customerName: '',
          address: '',
          meterType: request.meterType,
          errorCode: data.code || 'VERIFICATION_FAILED',
          errorMessage:
            data.response_description ||
            data.content?.errors ||
            data.message ||
            'Unable to verify meter details with DISCO provider.',
          rawResponse: data,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('[VTpass] Live verifyMeter HTTP call failed:', err);
        return {
          success: false,
          meterNumber: sanitizedMeter,
          discoCode: request.discoCode,
          customerName: '',
          address: '',
          meterType: request.meterType,
          errorCode: err.name === 'AbortError' ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR',
          errorMessage: err.name === 'AbortError'
            ? 'Request timed out while connecting to VTpass.'
            : `Network error reaching VTpass (${err?.message || 'Check connection or CORS'}).`,
        };
      }
    }

    // Explicit notice if keys were not loaded into the runtime
    console.warn('[VTpass] No API credentials found in process.env. (EXPO_PUBLIC_VTPASS_API_KEY / EXPO_PUBLIC_VTPASS_SECRET_KEY)');
    return {
      success: false,
      meterNumber: sanitizedMeter,
      discoCode: request.discoCode,
      customerName: '',
      address: '',
      meterType: request.meterType,
      errorCode: 'MISSING_CREDENTIALS',
      errorMessage: 'VTpass API credentials not found in environment. Please add EXPO_PUBLIC_VTPASS_API_KEY and EXPO_PUBLIC_VTPASS_SECRET_KEY to your .env file and restart Expo with `npx expo start -c`.',
    };
  }

  async vendToken(request: VendTokenRequest): Promise<VendTokenResponse> {
    const disco = NIGERIAN_DISCOS.find(
      (d) =>
        d.code.toLowerCase() === request.discoCode.toLowerCase() ||
        d.shortName.toLowerCase() === request.discoCode.toLowerCase() ||
        request.discoCode.toLowerCase().includes(d.code.toLowerCase())
    );
    const sanitizedMeter = request.meterNumber.replace(/\s/g, '');
    const serviceID = disco?.serviceID || 'abuja-electric';
    const amountNaira = Math.round(request.amountKobo / 100);
    const requestId = request.internalReference || this.generateRequestId();

    const hasKeys = Boolean(this.apiKey || this.secretKey || this.publicKey);

    // If API keys are configured, make live HTTP call to VTpass
    if (hasKeys) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      try {
        const endpoint = `${this.baseUrl.replace(/\/$/, '')}/pay`;
        console.log(`[VTpass] Dispatching live vendToken to ${endpoint} for ${sanitizedMeter} (₦${amountNaira})`);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            request_id: requestId,
            serviceID,
            billersCode: sanitizedMeter,
            variation_code: request.meterType || 'prepaid',
            amount: amountNaira,
            phone: request.customerPhoneNumber || '08012345678',
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await response.json();
        console.log('[VTpass] vendToken response:', data?.code, data?.response_description);

        if (data.code === '000') {
          const rawToken =
            data.token ||
            data.purchased_code ||
            data.mainToken ||
            data.content?.transactions?.token ||
            '';
          const token = this.formatTokenString(rawToken);
          const rawUnits =
            data.units ||
            data.PurchasedUnits ||
            data.content?.transactions?.units ||
            data.Units ||
            null;
          const unitsKwh = rawUnits ? parseFloat(String(rawUnits)) : undefined;

          return {
            success: true,
            status: 'successful',
            token,
            unitsKwh,
            tariffPerKwhKobo: data.tariff ? Math.round(Number(data.tariff) * 100) : undefined,
            amountKobo: request.amountKobo,
            providerReference: data.exchangeReference || data.requestId || requestId,
            internalReference: requestId,
            responseMessage: data.response_description || 'Transaction Successful',
            rawResponse: data,
          };
        }

        if (data.code === '099') {
          return {
            success: false,
            status: 'processing',
            amountKobo: request.amountKobo,
            internalReference: requestId,
            providerReference: data.requestId,
            responseMessage: 'Transaction is processing with provider',
            rawResponse: data,
          };
        }

        return {
          success: false,
          status: 'failed',
          amountKobo: request.amountKobo,
          internalReference: requestId,
          responseMessage: data.response_description || data.message || 'Electricity vending failed with provider',
          rawResponse: data,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('[VTpass] Live vendToken HTTP call exception:', err);
        // CRITICAL FINTECH SAFETY: Network timeout or connection drop must NEVER be treated as 'failed'
        // Returning 'unknown' keeps transaction in-flight for reconciliation, preventing premature double-refunds
        return {
          success: false,
          status: 'unknown',
          amountKobo: request.amountKobo,
          internalReference: requestId,
          responseMessage: err.name === 'AbortError'
            ? 'Gateway timeout waiting for utility response. Transaction is awaiting reconciliation.'
            : `Network error connecting to VTpass: ${err?.message || 'Connection lost'}. Transaction awaiting reconciliation.`,
        };
      }
    }

    // Explicit notice if keys were not loaded into the runtime
    console.warn('[VTpass] No API credentials found in process.env when vending.');
    return {
      success: false,
      status: 'failed',
      amountKobo: request.amountKobo,
      internalReference: requestId,
      responseMessage: 'VTpass API credentials not configured in .env. Add EXPO_PUBLIC_VTPASS_API_KEY and restart Expo.',
    };
  }

  async queryTransactionStatus(request: QueryTransactionRequest): Promise<QueryTransactionResponse> {
    if (this.apiKey && this.secretKey) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const endpoint = `${this.baseUrl.replace(/\/$/, '')}/requery`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            request_id: request.internalReference,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await response.json();
        const status = data.code === '000' ? 'successful' : data.code === '099' ? 'processing' : 'failed';

        return {
          status,
          token: data.token ? this.formatTokenString(data.token) : undefined,
          unitsKwh: data.units ? parseFloat(data.units) : undefined,
          amountKobo: data.amount ? Math.round(Number(data.amount) * 100) : undefined,
          providerReference: data.requestId || request.providerReference,
          rawResponse: data,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.warn('VTpass requery failed:', err);
        return {
          status: 'unknown',
          providerReference: request.providerReference,
          rawResponse: {
            code: 'TIMEOUT',
            status: 'unknown',
            error: err?.message,
          },
        };
      }
    }

    return {
      status: 'unknown',
      providerReference: request.providerReference,
      rawResponse: {
        code: 'UNCONFIGURED',
        status: 'unknown',
        message: 'VTpass provider credentials not present for requery.',
      },
    };
  }
}
