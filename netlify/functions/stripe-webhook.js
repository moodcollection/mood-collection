const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function addToKlaviyoList(email, firstName, lastName) {
  // First create or update the profile
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
          last_name: lastName
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
  }

  if (profileId) {
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

    if (email) {
      await addToKlaviyoList(email, firstName, lastName);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
