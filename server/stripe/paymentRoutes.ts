import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient';

const router = Router();

const cartItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().positive(),
  quantity: z.number().int().positive(),
  category: z.string().optional(),
  image: z.string().optional(),
});

const createPaymentIntentSchema = z.object({
  items: z.array(cartItemSchema).min(1, "Cart cannot be empty"),
});

router.post('/create-shop-payment-intent', async (req: Request, res: Response) => {
  try {
    const result = createPaymentIntentSchema.safeParse(req.body);
    
    if (!result.success) {
      return res.status(400).json({ 
        message: "Invalid cart data", 
        errors: result.error.flatten() 
      });
    }

    const { items } = result.data;
    
    const totalAmount = items.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    if (totalAmount < 0.50) {
      return res.status(400).json({ message: "Minimum order amount is $0.50" });
    }

    if (totalAmount > 10000) {
      return res.status(400).json({ message: "Order amount cannot exceed $10,000" });
    }

    const stripe = await getUncachableStripeClient();
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        itemCount: items.length.toString(),
        itemIds: items.map(i => i.id).join(','),
      },
    });

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      amount: totalAmount,
    });
  } catch (error: any) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ 
      message: error.message || "Failed to initialize payment" 
    });
  }
});

router.get('/stripe-publishable-key', async (_req: Request, res: Response) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error: any) {
    console.error('Error getting Stripe publishable key:', error);
    res.status(500).json({ message: "Failed to get Stripe configuration" });
  }
});

router.get('/stripe/products', async (_req: Request, res: Response) => {
  try {
    const stripe = await getUncachableStripeClient();
    
    const products = await stripe.products.list({
      active: true,
      limit: 100,
      expand: ['data.default_price'],
    });

    const formattedProducts = products.data.map(product => {
      const defaultPrice = product.default_price as any;
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        images: product.images,
        metadata: product.metadata,
        price: defaultPrice?.unit_amount ? defaultPrice.unit_amount / 100 : null,
        priceId: defaultPrice?.id,
        currency: defaultPrice?.currency || 'usd',
      };
    });

    res.json({ data: formattedProducts });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

export { router as paymentRoutes };
