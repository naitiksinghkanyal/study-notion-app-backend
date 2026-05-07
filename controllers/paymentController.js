/**
 * Payment Controller — Stripe integration
 * Creates payment intents and handles webhooks
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Course = require('../models/Course');
const { Enrollment } = require('../models/Enrollment');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');

// ── POST /api/payments/create-intent — Create Stripe PaymentIntent ────────────
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const { courseId } = req.body;

    const course = await Course.findById(courseId);
    if (!course) return next(new AppError('Course not found.', 404));
    if (course.isFree || course.price === 0) {
      return next(new AppError('This course is free. No payment needed.', 400));
    }

    // Ensure student not already enrolled
    const existing = await Enrollment.findOne({ student: req.user._id, course: courseId });
    if (existing) return next(new AppError('Already enrolled.', 409));

    // Get or create Stripe customer
    let stripeCustomerId = req.user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name,
        metadata: { userId: req.user._id.toString() },
      });
      stripeCustomerId = customer.id;
      await User.findByIdAndUpdate(req.user._id, { stripeCustomerId });
    }

    // Create payment intent (amount in cents)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(course.price * 100),
      currency: 'usd',
      customer: stripeCustomerId,
      metadata: {
        courseId: courseId.toString(),
        userId: req.user._id.toString(),
      },
      description: `Enrollment: ${course.title}`,
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        amount: course.price,
        currency: 'usd',
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/payments/webhook — Stripe webhook handler ──────────────────────
exports.stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw body (not parsed)
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful payment
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const { courseId, userId } = paymentIntent.metadata;

    try {
      // Create enrollment after successful payment
      const existing = await Enrollment.findOne({ student: userId, course: courseId });
      if (!existing) {
        await Enrollment.create({
          student: userId,
          course: courseId,
          paymentStatus: 'paid',
          paymentIntentId: paymentIntent.id,
          amountPaid: paymentIntent.amount / 100,
        });
        await Course.findByIdAndUpdate(courseId, { $inc: { enrollmentCount: 1 } });
        console.log(`✅ Enrollment created for user ${userId} in course ${courseId}`);
      }
    } catch (err) {
      console.error('Error creating enrollment after payment:', err);
    }
  }

  res.json({ received: true });
};

// ── GET /api/payments/history — Student: Payment history ─────────────────────
exports.getPaymentHistory = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({
      student: req.user._id,
      paymentStatus: 'paid',
    })
      .populate('course', 'title thumbnail price')
      .sort('-createdAt');

    res.json({ success: true, data: { payments: enrollments } });
  } catch (error) {
    next(error);
  }
};
