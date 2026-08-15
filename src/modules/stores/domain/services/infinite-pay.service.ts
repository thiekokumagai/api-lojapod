export class InfinitePayService { 

  private getHandle(): string {
    return process.env.INFINITEPAY_HANDLE || '';
  }

  /**
   * Cria um link de checkout na InfinitePay para a assinatura da loja
   * @param storeId ID da loja
   * @param invoiceId ID da fatura (StoreInvoice)
   * @param amount Valor da mensalidade (ex: 99.90)
   */
  async createSubscriptionCheckout(storeId: string, invoiceId: string, amount: number): Promise<string> {
    const handle = this.getHandle();

    if (!handle) {
      console.error('INFINITEPAY_HANDLE não configurado.');
      throw new Error('Configuração INFINITEPAY_HANDLE ausente no servidor.');
    }

    const priceInCents = Math.round(amount * 100);
    const webhookUrl = `${process.env.API_URL || 'http://localhost:3000'}/subscriptions/webhook/infinitepay`;
    const redirectUrl = `${process.env.ADMIN_URL || 'http://localhost:5173'}/payment?invoice=${invoiceId}&status=success`;

    const payload = {
      handle,
      redirect_url: redirectUrl,
      webhook_url: webhookUrl,
      order_nsu: invoiceId,
      items: [
        {
          quantity: 1,
          price: priceInCents,
          description: `Mensalidade LojaPod - Loja ${storeId}`
        }
      ]
    };

    try {
      const response = await fetch('https://api.checkout.infinitepay.io/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Erro na API InfinitePay:', errorData);
        throw new Error(`Falha ao gerar link InfinitePay: ${response.status}`);
      }

      const data = await response.json();
      // O endpoint retorna os dados do link. A URL gerada geralmente vem em `data.url` ou similar.
      return data.url || data.link || '';
    } catch (error) {
      console.error('Erro InfinitePayService:', error);
      throw error;
    }
  }
}

export const infinitePayService = new InfinitePayService();
