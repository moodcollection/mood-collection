const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function triggerKlaviyoFlow(email, firstName, lastName, total) {
  await fetch('https://a.klaviyo.com/api/profiles/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
      'Content-Type': 'application/json',
      'revision': '2023-12-15'
    },
    body: JSON.stringify({
      data: {
        type: 'profile',
        attributes: {
          email: email,
          first_name: firstName,
          last_name: lastName
        }
      }
    })
  });

  await fetch('https://a.klaviyo.com/api/events/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
      'Content-Type': 'application/json',
      'revision': '2023-12-15'
    },
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          metric: {
            data: {
              type: 'metric',
              attributes: {
                name: 'Successfully Paid'
              }
            }
          },
          profile: {
            data: {
              type: 'profile',
              attributes: {
                email: email,
                first_name: firstName,
                last_name: lastName
              }
            }
          },
          properties: {
            total: total,
            currency: 'GBP'
          },
          time: new Date().toISOString()
        }
      }
    })
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return { statusCode: 400, body: `Webhook Error: ${err.message }` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const email = session.customer_details?.email;
    const firstName = session.customer_details?.name?.split(' ')[0] || '';
    const lastName = session.customer_details?.name?.split(' ').slice(1).join(' ') || '';
    const total = session.amount_total / 100;

    if (email) {
      await triggerKlaviyoFlow(email, firstName, lastName, total);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
