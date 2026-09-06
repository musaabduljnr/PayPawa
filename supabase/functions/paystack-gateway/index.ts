import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secretKey) {
      return new Response(
        JSON.stringify({
          success: false,
          errorMessage: 'PAYSTACK_SECRET_KEY is not configured on Supabase server.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'initialize') {
      const {
        internalReference,
        amountKobo,
        customerEmail,
        customerName,
        customerPhone,
        paymentMethod,
        callbackUrl,
        metadata,
      } = body;

      const channels =
        paymentMethod === 'card'
          ? ['card']
          : paymentMethod === 'transfer'
          ? ['bank_transfer']
          : paymentMethod === 'ussd'
          ? ['ussd']
          : ['card', 'bank_transfer', 'ussd', 'qr'];

      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference: internalReference,
          amount: amountKobo,
          email: customerEmail,
          currency: 'NGN',
          callback_url: callbackUrl || 'https://standard.paystack.co/close',
          channels,
          metadata: {
            ...metadata,
            internal_reference: internalReference,
            customer_phone: customerPhone,
            customer_name: customerName,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.status) {
        return new Response(
          JSON.stringify({
            success: false,
            errorMessage: data.message || `Paystack initialization failed (HTTP ${response.status})`,
            rawResponse: data,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          providerReference: data.data?.reference || internalReference,
          internalReference,
          checkoutUrl: data.data?.authorization_url,
          accessCode: data.data?.access_code,
          responseMessage: 'Paystack authorization initialized successfully.',
          rawResponse: data,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'verify') {
      const { reference } = body;
      if (!reference) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'Reference is required for verification.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const refToQuery = encodeURIComponent(reference);
      const response = await fetch(`https://api.paystack.co/transaction/verify/${refToQuery}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok || !data.status) {
        return new Response(
          JSON.stringify({
            success: false,
            status: 'unknown',
            errorMessage: data.message || `Paystack verification failed (HTTP ${response.status})`,
            rawResponse: data,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const tx = data.data;
      const isSuccessful = tx.status === 'success';
      const isFailed = tx.status === 'failed' || tx.status === 'reversed';
      const status = isSuccessful ? 'successful' : isFailed ? 'failed' : 'pending';

      return new Response(
        JSON.stringify({
          success: isSuccessful,
          status,
          amountKobo: tx.amount,
          currency: tx.currency,
          paidAt: tx.paid_at || tx.paidAt,
          channel: tx.channel,
          providerReference: tx.reference,
          internalReference: tx.metadata?.internal_reference || reference,
          responseMessage: tx.gateway_response || data.message || 'Payment verified',
          rawResponse: data,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
