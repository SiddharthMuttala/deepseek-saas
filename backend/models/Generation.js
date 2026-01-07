const mongoose = require('mongoose');

const generationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  promptType: {
    type: String,
    required: true
  },
  userInput: {
    type: String,
    required: true
  },
  aiResponse: {
    type: String,
    required: true
  },
  tokensUsed: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Generation', generationSchema);