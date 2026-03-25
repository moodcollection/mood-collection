const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { email } = JSON.parse(event.body);

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Email is required' }) };
    }

    const customers = await stripe.customers.list({ email: email, limit: 10 });

    if (customers.data.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ orders: [] }) };
    }

    const customerId = customers.data[0].id;

    const paymentIntents = await stripe.paymentIntents.list({
      customer: customerId,
      limit: 20
    });

    const orders = paymentIntents.data
      .filter(pi => pi.status === 'succeeded')
      .map(pi => ({
        id: pi.id,
        date: new Date(pi.created * 1000).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }),
        amount: (pi.amount / 100).toFixed(2),
        currency: pi.currency.toUpperCase(),
        description: pi.description || 'MØØD Collection Order'
      }));

    return {
      statusCode: 200,
      body: JSON.stringify({ orders })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
