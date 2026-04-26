const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function addToKlaviyoList(email, firstName, lastName, orderDetails) {
  const profileResponse = await fetch('https://a.klaviyo.com/api/profiles/', {
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
          last_name: lastName,
          properties: {
            last_order_total: orderDetails.total,
            last_order_date: orderDetails.date,
            last_order_items: orderDetails.items
          }
        }
      }
    })
  });

  let profileId;

  if (profileResponse.status === 201) {
    const profileData = await profileResponse.json();
    profileId = profileData.data.id;
  } else if (profileResponse.status === 409) {
    const profileData = await profileResponse.json();
    profileId = profileData.errors[0].meta.duplicate_profile_id;

    await fetch(`https://a.klaviyo.com/api/profiles/${profileId}/`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2023-12-15'
      },
      body: JSON.stringify({
        data: {
          type: 'profile',
          id: profileId,
          attributes: {
            properties: {
              last_order_total: orderDetails.total,
              last_order_date: orderDetails.date,
              last_order_items: orderDetails.items
            }
          }
        }
      })
    });
  }

  if (profileId) {
    // Remove from list first
    await fetch(`https://a.klaviyo.com/api/lists/Vbw9d6/relationships/profiles/`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2023-12-15'
      },
      body: JSON.stringify({
        data: [
          {
            type: 'profile',
            id: profileId
          }
        ]
      })
    });

    // Wait a moment then add back
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Add back to list to trigger flow
    await fetch(`https://a.klaviyo.com/api/lists/Vbw9d6/relationships/profiles/`, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2023-12-15'
      },
      body: JSON.stringify({
        data: [
          {
            type: 'profile',
            id: profileId
          }
        ]
      })
    });
  }
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
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const email = session.customer_details?.email;
    const firstName = session.customer_details?.name?.split(' ')[0] || '';
    const lastName = session.customer_details?.name?.split(' ').slice(1).join(' ') || '';

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    const items = lineItems.data.map(item => `${item.description} x${item.quantity}`).join(', ');
    const total = session.amount_total / 100;
    const date = new Date().toLocaleDateString('en-GB');

    const orderDetails = {
      total: total,
      date: date,
      items: items
    };

    if (email) {
      await addToKlaviyoList(email, firstName, lastName, orderDetails);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
