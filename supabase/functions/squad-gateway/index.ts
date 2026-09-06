import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const secretKey = Deno.env.get('SQUAD_SECRET_KEY');
    const baseUrl = (Deno.env.get('SQUAD_BASE_URL') || 'https://api-d.squadco.com').replace(/\/$/, '');

    if (!secretKey) {
      return new Response(
        JSON.stringify({
          success: false,
          errorMessage: 'SQUAD_SECRET_KEY is not configured on Supabase server.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${secretKey}`,
    };

    const body = await req.json();
    const { action } = body;

    // 1. DISCO Directory Discovery
    if (action === 'disco_list') {
      const endpoint = `${baseUrl}/vending/utilities/electricity/service-providers`;
      const response = await fetch(endpoint, { method: 'GET', headers });
      const res = await response.json();
      return new Response(JSON.stringify(res), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. JIT Meter Lookup & Validation
    if (action === 'lookup' || action === 'validate_meter') {
      const { meterNumber, meterType, provider } = body;
      const endpoint = `${baseUrl}/vending/utilities/electricity/lookup`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meter_no: meterNumber,
          meter_type: meterType || 'prepaid',
          provider,
        }),
      });
      const res = await response.json();
      return new Response(JSON.stringify(res), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Electricity Token Vending
    if (action === 'vend') {
      const {
        amountNaira,
        meterNumber,
        meterType,
        discoCode,
        customerPhoneNumber,
        customerEmail,
        internalReference,
        sessionReference,
      } = body;

      const endpoint = `${baseUrl}/vending/utilities/electricity`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: amountNaira,
          phone: customerPhoneNumber || '08012345678',
          meter_type: meterType || 'prepaid',
          meter_no: meterNumber,
          provider: discoCode,
          reference: sessionReference || internalReference,
          email: customerEmail || 'customer@paypawa.ng',
        }),
      });
      const res = await response.json();
      return new Response(JSON.stringify(res), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Transaction & STS Token Requery
    if (action === 'query') {
      const { reference } = body;
      const endpoint = `${baseUrl}/vending/transactions?reference=${encodeURIComponent(reference)}`;
      const response = await fetch(endpoint, { method: 'GET', headers });
      const res = await response.json();
      return new Response(JSON.stringify(res), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ success: false, errorMessage: `Unsupported action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, errorMessage: `Server Exception: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
