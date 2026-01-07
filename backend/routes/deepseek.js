const express = require('express');
const router = express.Router();
const axios = require('axios');
const Generation = require('../models/Generation');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Helper function to verify token
const verifyToken = (req, res, next) => {
  console.log('🔐 Auth check for:', req.path);
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  console.log('Token check:', {
    hasAuthHeader: !!authHeader,
    tokenExists: !!token,
    tokenType: token ? token.substring(0, 10) + '...' : 'none'
  });
  
  // For development/demo: Accept requests without token
  if (!token && process.env.NODE_ENV === 'development') {
    console.log('⚠️ No token in development mode, creating demo user');
    req.user = { 
      userId: '507f1f77bcf86cd799439011', // Valid ObjectId format
      name: 'Demo User', 
      email: 'demo@example.com' 
    };
    return next();
  }
  
  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ 
      success: false, 
      error: 'Access token required' 
    });
  }
  
  try {
    // Verify the token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );
    
    console.log('✅ Token verified for user:', decoded.email);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    
    // More specific error messages
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Hardcoded custom prompts
const CUSTOM_PROMPTS = {
  general_chat: "You are a helpful AI assistant. Respond conversationally and provide detailed, helpful responses.",
  business_plan: "Analyze this business idea and provide a comprehensive business plan including market analysis, SWOT analysis, target audience, marketing strategy, and financial projections.",
  code_review: "Review this code for best practices, identify bugs, security issues, suggest optimizations, and provide improved code examples.",
  content_strategy: "Create a content strategy including topics, platforms, posting schedule, engagement tactics, and performance metrics.",
  market_research: "Provide detailed market research including competitors, trends, opportunities, threats, and market size.",
  learning_path: "Create a personalized learning path with resources, milestones, projects, and assessment methods.",
  email_writing: "Write professional, clear, and effective emails for the given purpose and audience.",
  creative_writing: "Help with creative writing including stories, poems, scripts, and brainstorming ideas.",
  problem_solving: "Analyze problems systematically and provide step-by-step solutions with implementation guidance.",
  // New prompt for Codeforces analysis
  codeforces_analysis: "You are a competitive programming expert specializing in Codeforces analysis. Analyze the user's Codeforces data and provide specific, actionable recommendations including problem IDs, areas to focus on, and study plans. Structure your response with clear sections and be specific about problem recommendations."
};

// Test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'DeepSeek routes are working!',
    available_prompts: Object.keys(CUSTOM_PROMPTS),
    endpoints: {
      generate: 'POST /api/deepseek/generate',
      codeforces: 'POST /api/deepseek/codeforces',
      prompts: 'GET /api/deepseek/prompts',
      prompts_by_id: 'GET /api/deepseek/prompts/:id',
      test: 'GET /api/deepseek/test',
      history: 'GET /api/deepseek/history',
      history_by_id: 'GET /api/deepseek/history/:id',
      stats: 'GET /api/deepseek/stats'
    },
    timestamp: new Date().toISOString()
  });
});

// Get available prompt types
router.get('/prompts', verifyToken, (req, res) => {
  const prompts = Object.keys(CUSTOM_PROMPTS).map(key => ({
    id: key,
    name: key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
    description: CUSTOM_PROMPTS[key].substring(0, 150),
    category: getCategory(key)
  }));
  
  res.json({
    success: true,
    prompts: prompts,
    user: req.user.name
  });
});

// Get prompt by ID
router.get('/prompts/:id', verifyToken, (req, res) => {
  const promptId = req.params.id;
  const prompt = CUSTOM_PROMPTS[promptId];
  
  if (!prompt) {
    return res.status(404).json({
      success: false,
      error: 'Prompt not found'
    });
  }
  
  res.json({
    success: true,
    prompt: {
      id: promptId,
      name: promptId.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      description: prompt,
      category: getCategory(promptId),
      color: getPromptColor(promptId)
    }
  });
});

// Helper function to categorize prompts
function getCategory(promptId) {
  const categories = {
    Business: ['business_plan', 'market_research'],
    Development: ['code_review', 'learning_path', 'codeforces_analysis'],
    Marketing: ['content_strategy', 'email_writing'],
    Creative: ['creative_writing'],
    General: ['general_chat', 'problem_solving']
  };
  
  for (const [category, prompts] of Object.entries(categories)) {
    if (prompts.includes(promptId)) {
      return category;
    }
  }
  return 'General';
}

// Helper function to get prompt color
function getPromptColor(promptId) {
  const colors = {
    business_plan: '#4caf50',
    code_review: '#f44336',
    content_strategy: '#ff9800',
    general_chat: '#2196f3',
    market_research: '#8bc34a',
    learning_path: '#00bcd4',
    email_writing: '#3f51b5',
    creative_writing: '#9c27b0',
    problem_solving: '#607d8b',
    codeforces_analysis: '#9c27b0'
  };
  return colors[promptId] || '#2196f3';
}

// Get response from DeepSeek API - General endpoint
router.post('/generate', verifyToken, async (req, res) => {
  try {
    const { promptType, userInput, context = '' } = req.body;
    
    console.log('Generate request received:', { 
      promptType, 
      userInputLength: userInput?.length,
      contextLength: context?.length,
      user: req.user.name 
    });
    
    // Validate request
    if (!promptType || !userInput) {
      return res.status(400).json({ 
        success: false,
        error: 'promptType and userInput are required' 
      });
    }

    // Get the custom prompt template
    const customPrompt = CUSTOM_PROMPTS[promptType];
    if (!customPrompt) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid prompt type. Available types: ' + Object.keys(CUSTOM_PROMPTS).join(', ')
      });
    }

    // Combine context, custom prompt with user input
    const fullPrompt = context ? 
      `${context}\n${customPrompt}\n\nUser Input: ${userInput}` :
      `${customPrompt}\n\nUser Input: ${userInput}`;

    // Call the AI API
    const aiResult = await callDeepSeekAPI(fullPrompt, req.user);
    
    // Save to Generation model
    let savedGeneration = null;
    try {
      // Create ObjectId for demo user if needed
      let userId;
      if (req.user.userId && req.user.userId.startsWith('demo')) {
        userId = '507f1f77bcf86cd799439011'; // Valid ObjectId format
      } else {
        userId = req.user.userId;
      }

      const generation = new Generation({
        userId: userId,
        promptType,
        userInput,
        aiResponse: aiResult.data,
        tokensUsed: aiResult.tokensUsed,
        mode: aiResult.mode
      });
      
      savedGeneration = await generation.save();
      console.log(`✅ Generation saved to database (${aiResult.mode} mode)`);
      
      // Update user's API usage
      try {
        const user = await User.findById(userId);
        if (user) {
          await user.incrementApiUsage(aiResult.tokensUsed);
        }
      } catch (userError) {
        console.log('Could not update user API usage:', userError.message);
      }
      
    } catch (dbError) {
      console.error('Failed to save generation to database:', dbError.message);
      // Continue even if save fails
    }

    res.json({
      success: true,
      data: aiResult.data,
      promptType,
      mode: aiResult.mode,
      tokens: aiResult.tokensUsed,
      generationId: savedGeneration ? savedGeneration._id : null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Generate endpoint error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate response',
      details: error.message,
      mode: 'error'
    });
  }
});

// Special endpoint for Codeforces analysis
router.post('/codeforces', verifyToken, async (req, res) => {
  try {
    const { handle, userData, analysis } = req.body;
    
    console.log('Codeforces analysis request received:', { 
      handle,
      userDataExists: !!userData,
      analysisExists: !!analysis,
      user: req.user.name 
    });
    
    // Validate request
    if (!handle || !userData || !analysis) {
      return res.status(400).json({ 
        success: false,
        error: 'handle, userData, and analysis are required' 
      });
    }

    // Generate the analysis prompt
    const codeforcesPrompt = generateCodeforcesPrompt(handle, userData, analysis);
    
    // Call the AI API with the Codeforces-specific prompt
    const aiResult = await callDeepSeekAPI(codeforcesPrompt, req.user, CUSTOM_PROMPTS.codeforces_analysis);
    
    // Save to Generation model
    let savedGeneration = null;
    try {
      // Create ObjectId for demo user if needed
      let userId;
      if (req.user.userId && req.user.userId.startsWith('demo')) {
        userId = '507f1f77bcf86cd799439011'; // Valid ObjectId format
      } else {
        userId = req.user.userId;
      }

      const generation = new Generation({
        userId: userId,
        promptType: 'codeforces_analysis',
        userInput: `Codeforces analysis for ${handle}`,
        aiResponse: aiResult.data,
        tokensUsed: aiResult.tokensUsed,
        mode: aiResult.mode,
        metadata: {
          handle: handle,
          rating: userData.rating,
          problemsSolved: analysis.totalProblemsSolved
        }
      });
      
      savedGeneration = await generation.save();
      console.log(`✅ Codeforces generation saved to database (${aiResult.mode} mode)`);
      
      // Update user's API usage
      try {
        const user = await User.findById(userId);
        if (user) {
          await user.incrementApiUsage(aiResult.tokensUsed);
        }
      } catch (userError) {
        console.log('Could not update user API usage:', userError.message);
      }
      
    } catch (dbError) {
      console.error('Failed to save generation to database:', dbError.message);
      // Continue even if save fails
    }

    res.json({
      success: true,
      data: aiResult.data,
      promptType: 'codeforces_analysis',
      mode: aiResult.mode,
      tokens: aiResult.tokensUsed,
      generationId: savedGeneration ? savedGeneration._id : null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Codeforces endpoint error:', error);
    
    // Generate fallback response
    const fallbackResponse = generateCodeforcesFallback(req.body.handle, req.body.userData, req.body.analysis);
    
    res.json({
      success: true,
      data: fallbackResponse,
      promptType: 'codeforces_analysis',
      mode: 'fallback',
      tokens: 0,
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function to call DeepSeek API
async function callDeepSeekAPI(fullPrompt, user, systemPrompt = 'You are a helpful AI assistant specialized in providing detailed, structured responses.') {
  // Check if we have a DeepSeek API key
  const apiKey = process.env.DEEPSEEK_API_KEY;
  let aiResponse = '';
  let tokensUsed = 0;
  let mode = 'mock';
  
  if (!apiKey || apiKey === 'your-deepseek-api-key-here') {
    console.log('⚠️ No valid DeepSeek API key found, using mock response');
    aiResponse = generateMockResponse('general_chat', fullPrompt);
    mode = 'mock';
  } else {
    try {
      // Call DeepSeek API
      console.log('Calling DeepSeek API...');
      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: fullPrompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 30 second timeout
        }
      );

      aiResponse = response.data.choices[0]?.message?.content || 'No response from AI';
      tokensUsed = response.data.usage?.total_tokens || 0;
      mode = 'ai';
      
    } catch (apiError) {
      console.error('DeepSeek API Error:', apiError.message);
      aiResponse = generateMockResponse('general_chat', fullPrompt);
      mode = 'error-fallback';
    }
  }
  
  return {
    data: aiResponse,
    tokensUsed,
    mode
  };
}

// Helper function to generate Codeforces prompt
function generateCodeforcesPrompt(handle, userData, analysis) {
  const userRating = userData.rating || 0;
  const userRank = userData.rank || 'unrated';
  
  let prompt = `I have analyzed the Codeforces profile of ${handle}. Here's a detailed analysis:\n\n`;
  
  // Basic user info
  prompt += `User Information:\n`;
  prompt += `- Handle: ${handle}\n`;
  prompt += `- Current Rating: ${userRating} (${userRank})\n`;
  prompt += `- Max Rating: ${userData.maxRating || userRating}\n`;
  prompt += `- Organization: ${userData.organization || 'Not specified'}\n\n`;
  
  // Performance metrics
  prompt += `Performance Metrics:\n`;
  prompt += `- Total Problems Solved: ${analysis.totalProblemsSolved}\n`;
  prompt += `- Total Submissions: ${analysis.totalSubmissions}\n`;
  prompt += `- Acceptance Rate: ${((analysis.totalAccepted / analysis.totalSubmissions) * 100).toFixed(1)}%\n`;
  prompt += `- Highest Solved Rating: ${analysis.highestSolvedRating}\n\n`;
  
  // Strength analysis
  prompt += `Strengths (Top Problem Tags):\n`;
  if (analysis.topTags && analysis.topTags.length > 0) {
    analysis.topTags.slice(0, 5).forEach(([tag, count], index) => {
      prompt += `${index + 1}. ${tag}: ${count} problems solved\n`;
    });
  } else {
    prompt += `No tag data available\n`;
  }
  
  // Weakness analysis
  prompt += `\nAreas for Improvement (Weakest Tags):\n`;
  if (analysis.weakTags && analysis.weakTags.length > 0) {
    analysis.weakTags.forEach((tag, index) => {
      const solvedCount = analysis.solvedByTag?.[tag] || 0;
      prompt += `${index + 1}. ${tag}: Only ${solvedCount} problems solved\n`;
    });
  } else {
    prompt += `No weakness data available\n`;
  }
  
  // Rating distribution analysis
  prompt += `\nRating Distribution Analysis:\n`;
  if (analysis.ratingDistribution && analysis.ratingDistribution.length > 0) {
    const ratings = analysis.ratingDistribution.map(([rating]) => parseInt(rating));
    const avgSolvedRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    prompt += `- Average solved problem rating: ${avgSolvedRating.toFixed(0)}\n`;
    prompt += `- Current rating capability: ${userRating}\n`;
    prompt += `- Gap to next level: ${Math.max(0, userRating + 100 - avgSolvedRating).toFixed(0)} rating points\n`;
  } else {
    prompt += `No rating distribution data available\n`;
  }
  
  // Language proficiency
  prompt += `\nProgramming Language Usage:\n`;
  if (analysis.topLanguages && analysis.topLanguages.length > 0) {
    analysis.topLanguages.forEach(([lang, count], index) => {
      const percentage = ((count / analysis.totalSubmissions) * 100).toFixed(1);
      prompt += `${index + 1}. ${lang}: ${percentage}% of submissions\n`;
    });
  } else {
    prompt += `No language data available\n`;
  }
  
  // Problem-solving patterns
  prompt += `\nProblem-Solving Patterns:\n`;
  prompt += `- Maximum attempts on a single problem: ${analysis.maxAttempts || 'N/A'}\n`;
  if (analysis.maxAttempts > 5) {
    prompt += `- Pattern: Tendency to persist on difficult problems (good for learning)\n`;
  } else {
    prompt += `- Pattern: Efficient problem-solver, moves on quickly\n`;
  }
  
  // Specific recommendations request
  prompt += `\nBased on this analysis, please provide:\n`;
  prompt += `1. Specific competitive programming areas to focus on\n`;
  prompt += `2. Recommended problem ratings to target (current level and next level)\n`;
  prompt += `3. Study plan suggestions\n`;
  prompt += `4. Key problem types to practice\n`;
  prompt += `5. Tips to improve contest performance\n`;
  prompt += `6. Recommended Codeforces problem IDs to solve next (provide 5-10 specific problem IDs with ratings)\n`;
  prompt += `\nPlease structure your response with clear sections and be specific about problem recommendations.`;
  
  return prompt;
}

// Helper function to generate Codeforces fallback response
function generateCodeforcesFallback(handle, userData, analysis) {
  const userRating = userData.rating || 1200;
  const ratingRange = [Math.max(800, userRating - 100), userRating + 100];
  
  let response = `## Codeforces Analysis for ${handle}\n\n`;
  
  response += `### 📊 Basic Statistics\n`;
  response += `- **Rating**: ${userData.rating || 'Unrated'} (${userData.rank || 'Unranked'})\n`;
  response += `- **Max Rating**: ${userData.maxRating || userData.rating || 'Unrated'}\n`;
  response += `- **Problems Solved**: ${analysis.totalProblemsSolved || 0}\n`;
  response += `- **Acceptance Rate**: ${analysis.totalSubmissions > 0 ? ((analysis.totalAccepted / analysis.totalSubmissions) * 100).toFixed(1) : 0}%\n\n`;
  
  if (analysis.topTags && analysis.topTags.length > 0) {
    response += `### 🏆 Top Strengths\n`;
    analysis.topTags.slice(0, 3).forEach(([tag, count], index) => {
      response += `${index + 1}. **${tag}**: ${count} problems solved\n`;
    });
  }
  
  if (analysis.weakTags && analysis.weakTags.length > 0) {
    response += `\n### 📈 Areas for Improvement\n`;
    analysis.weakTags.slice(0, 3).forEach((tag, index) => {
      const solvedCount = analysis.solvedByTag?.[tag] || 0;
      response += `${index + 1}. **${tag}**: Only ${solvedCount} problems solved\n`;
    });
  }
  
  response += `\n### 🎯 Recommended Next Steps\n`;
  response += `1. **Target Rating**: Practice problems rated ${ratingRange[0]}-${ratingRange[1]}\n`;
  response += `2. **Weak Areas**: Focus on ${analysis.weakTags?.[0] || 'dynamic programming'} problems\n`;
  response += `3. **Contest Strategy**: Participate in Div 2 contests regularly\n`;
  response += `4. **Learning Plan**: Solve 5-10 problems daily from different categories\n\n`;
  
  response += `### 💡 Specific Recommendations\n`;
  response += `- **Immediate Focus**: ${analysis.weakTags?.[0] || 'Graph Theory'} problems\n`;
  response += `- **Problem Count**: Aim for 50 more solves in your weak areas\n`;
  response += `- **Rating Goal**: Target ${userRating + 100} within 2 months\n`;
  response += `- **Resources**: Use Codeforces Edu section for tutorials\n\n`;
  
  response += `### 🔗 Recommended Practice Problems\n`;
  response += `(These are general recommendations - connect to backend for specific problem IDs)\n`;
  response += `1. Search Codeforces for "${analysis.weakTags?.[0] || 'dp'}" tagged problems at ${ratingRange[0]} rating\n`;
  response += `2. Try recent Div 2 A/B problems to build speed\n`;
  response += `3. Practice virtual contests to simulate real competition\n`;
  
  return response;
}

// Get user's generation history
router.get('/history', verifyToken, async (req, res) => {
  try {
    const { limit = 20, skip = 0, promptType } = req.query;
    
    // Build query
    const query = {};
    
    // For demo users, show all demo generations
    if (req.user.userId && req.user.userId.startsWith('demo')) {
      query.userId = '507f1f77bcf86cd799439011'; // Demo user ID
    } else {
      query.userId = req.user.userId;
    }
    
    if (promptType && promptType !== 'all') {
      query.promptType = promptType;
    }
    
    // Get generations
    const generations = await Generation.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .select('-__v');
    
    // Get total count
    const total = await Generation.countDocuments(query);
    
    // Format response
    const formattedGenerations = generations.map(gen => ({
      id: gen._id,
      promptType: gen.promptType,
      userInput: gen.userInput,
      aiResponse: gen.aiResponse,
      tokensUsed: gen.tokensUsed,
      mode: gen.mode,
      createdAt: gen.createdAt,
      promptName: gen.promptType.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    }));
    
    res.json({
      success: true,
      generations: formattedGenerations,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      hasMore: total > (parseInt(skip) + parseInt(limit))
    });
    
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch generation history'
    });
  }
});

// Get specific generation by ID
router.get('/history/:id', verifyToken, async (req, res) => {
  try {
    const query = {
      _id: req.params.id
    };
    
    // Check user access
    if (req.user.userId && req.user.userId.startsWith('demo')) {
      query.userId = '507f1f77bcf86cd799439011'; // Demo user ID
    } else {
      query.userId = req.user.userId;
    }
    
    const generation = await Generation.findOne(query).select('-__v');
    
    if (!generation) {
      return res.status(404).json({
        success: false,
        error: 'Generation not found or access denied'
      });
    }
    
    res.json({
      success: true,
      generation: {
        id: generation._id,
        promptType: generation.promptType,
        userInput: generation.userInput,
        aiResponse: generation.aiResponse,
        tokensUsed: generation.tokensUsed,
        mode: generation.mode,
        createdAt: generation.createdAt,
        promptName: generation.promptType.split('_').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ')
      }
    });
    
  } catch (error) {
    console.error('Error fetching generation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch generation'
    });
  }
});

// Get generation statistics
router.get('/stats', verifyToken, async (req, res) => {
  try {
    // For demo users
    const userId = req.user.userId && req.user.userId.startsWith('demo') 
      ? '507f1f77bcf86cd799439011' 
      : req.user.userId;
    
    // Get total counts
    const totalGenerations = await Generation.countDocuments({ userId });
    const totalTokens = await Generation.aggregate([
      { $match: { userId } },
      { $group: { _id: null, total: { $sum: '$tokensUsed' } } }
    ]);
    
    // Get counts by prompt type
    const byPromptType = await Generation.aggregate([
      { $match: { userId } },
      { $group: { _id: '$promptType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get recent activity
    const recentActivity = await Generation.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('promptType createdAt mode');
    
    const stats = {
      totalGenerations,
      totalTokens: totalTokens[0]?.total || 0,
      byPromptType: byPromptType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      recentActivity: recentActivity.map(act => ({
        promptType: act.promptType,
        date: act.createdAt,
        mode: act.mode
      }))
    };
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// Generate mock responses for testing
function generateMockResponse(promptType, userInput) {
  const timestamp = new Date().toLocaleString();
  const responses = {
    general_chat: `**Response to:** "${userInput.substring(0, 100)}${userInput.length > 100 ? '...' : ''}"\n\nI understand you're asking about this topic. As your AI assistant, I would provide a detailed response here including:\n\n1. **Key information** related to your query\n2. **Actionable steps** you can take\n3. **Additional resources** for further learning\n4. **Practical examples** when applicable\n\n*This is a mock response generated at ${timestamp}. Connect a real AI API for actual responses.*`,
    
    business_plan: `**Business Plan Analysis**\n\n**Idea:** "${userInput.substring(0, 150)}${userInput.length > 150 ? '...' : ''}"\n\n### Executive Summary\nA comprehensive business plan would include:\n\n### 1. Market Analysis\n- Target market size and demographics\n- Competitor analysis\n- Market trends and opportunities\n\n### 2. Business Model\n- Revenue streams\n- Pricing strategy\n- Cost structure\n\n### 3. Marketing Strategy\n- Customer acquisition channels\n- Brand positioning\n- Marketing budget\n\n### 4. Financial Projections\n- 3-year revenue forecast\n- Profit and loss statements\n- Cash flow projections\n\n### 5. Implementation Timeline\n- Key milestones and deadlines\n- Resource allocation\n- Risk assessment\n\n*Mock business plan template - Add your specific details*\n\n*Generated: ${timestamp}*`,
    
    code_review: `**Code Review Report**\n\n**Code Sample:** \`${userInput.substring(0, 80)}${userInput.length > 80 ? '...' : ''}\`\n\n### Code Quality Assessment:\n✅ **Readability** - Code structure and naming conventions\n✅ **Performance** - Algorithm efficiency and optimization\n✅ **Security** - Input validation and vulnerability prevention\n✅ **Maintainability** - Modularity and documentation\n✅ **Error Handling** - Graceful failure management\n\n### Recommendations:\n1. Add comprehensive error handling\n2. Implement input validation and sanitization\n3. Write unit tests for critical functions\n4. Add inline documentation for complex logic\n5. Consider edge cases and boundary conditions\n6. Optimize database queries if applicable\n7. Implement proper logging\n\n### Security Checklist:\n- SQL injection prevention\n- XSS protection\n- CSRF tokens\n- Authentication/authorization\n- Data encryption\n\n*This is a mock code review. Actual review would analyze your specific code.*\n\n*Review date: ${timestamp}*`,
    
    content_strategy: `**Content Strategy Framework**\n\n**Focus:** "${userInput.substring(0, 100)}${userInput.length > 100 ? '...' : ''}"\n\n### Content Pillars:\n1. **Educational** - Tutorials, guides, how-tos\n2. **Inspirational** - Success stories, case studies\n3. **Promotional** - Product features, offers\n4. **Engagement** - Questions, polls, discussions\n\n### Platform Strategy:\n- **Blog**: Long-form articles (1500+ words)\n- **Social Media**: Visual content and quick tips\n- **Email**: Newsletter with exclusive content\n- **Video**: Tutorials and demonstrations\n- **Podcast**: Industry discussions and interviews\n\n### Content Calendar Template:\n**Month Overview:**\n- Week 1: Educational content\n- Week 2: Industry news/trends\n- Week 3: Product/case studies\n- Week 4: Community engagement\n\n### Performance Metrics:\n- Engagement rate\n- Conversion rate\n- Audience growth\n- Content reach\n- Time on page\n\n*Content strategy framework - Customize based on your specific goals*\n\n*Created: ${timestamp}*`,
    
    codeforces_analysis: `**Codeforces Analysis Report**\n\n**User Data:** "${userInput.substring(0, 200)}${userInput.length > 200 ? '...' : ''}"\n\n### Performance Analysis:\nBased on the provided Codeforces data, here are your key metrics:\n\n### Strengths:\n1. Strong problem-solving in algorithmic categories\n2. Good consistency in submission patterns\n3. Effective use of programming languages\n\n### Areas for Improvement:\n1. Need to practice more dynamic programming problems\n2. Could improve contest performance strategies\n3. Should focus on time management during competitions\n\n### Recommended Study Plan:\n1. **Daily Practice**: Solve 3-5 problems from Codeforces\n2. **Weekly Goals**: Complete one virtual contest\n3. **Monthly Target**: Increase rating by 100 points\n\n### Specific Problem Recommendations:\n1. Problem 4A - Watermelon (800 rating)\n2. Problem 71A - Way Too Long Words (800 rating)\n3. Problem 118A - String Task (900 rating)\n4. Problem 158A - Next Round (900 rating)\n5. Problem 50A - Domino piling (1000 rating)\n\n*This is a mock analysis. Connect to real AI API for personalized recommendations.*\n\n*Generated: ${timestamp}*`
  };
  
  return responses[promptType] || responses.general_chat;
}

module.exports = router;  