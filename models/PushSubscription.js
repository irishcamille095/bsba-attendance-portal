const mongoose = require('mongoose');

const PushSubscriptionSchema = new mongoose.Schema({
  subscription: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
