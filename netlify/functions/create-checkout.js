const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function trackKlaviyoEvent(email, firstName, lastName, items, total) {
  const klaviyoData = {
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
          items: items,
          total: total
        }
      }
    }
  };

  await fetch('https://a.klaviyo.com/api/events/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
      'Content-Type': 'application/json',
      'revision': '2023-12-15'
    },
    body: JSON.stringify(klaviyoData)
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { items, discountCode } = JSON.parse(event.body);
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'gbp',
        product_data: {
          name: item.name,
          description: item.description,
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));
    const cartTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shippingRate = cartTotal >= 70 
      ? 'shr_1TFinSACqvQrWEreI0bRnnnK'
      : 'shr_1TFilmACqvQrWEre5R2hjIwr';
    const sessionParams = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: 'https://mymoodcollection.co.uk/order-confirmed.html',
      cancel_url: 'https://mymoodcollection.co.uk/shop.html',
      shipping_address_collection: {
        allowed_countries: ['GB'],
      },
      shipping_options: [
        { shipping_rate: shippingRate }
      ],
      customer_creation: 'always',
      billing_address_collection: 'required',
      allow_promotion_codes: true,
    };
    if (discountCode) {
      try {
        const coupon = await stripe.coupons.retrieve(discountCode);
        if (coupon) {
          sessionParams.discounts = [{ coupon: coupon.id }];
        }
      } catch (e) {
        // Invalid code, just ignore it
      }
    }
    const session = await stripe.checkout.sessions.create(sessionParams);
    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
