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

    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: 20
    });

    const orders = sessions.data
      .filter(session => session.payment_status === 'paid')
      .map(session => ({
        id: session.id,
        date: new Date(session.created * 1000).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }),
        amount: (session.amount_total / 100).toFixed(2),
        currency: session.currency.toUpperCase(),
        description: 'MØØD Collection Order'
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
