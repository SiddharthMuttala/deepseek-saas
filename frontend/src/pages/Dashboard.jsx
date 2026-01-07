import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, deepseekAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  Send,
  Person,
  SmartToy,
  Delete,
  ContentCopy,
  ThumbUp,
  ThumbDown,
  Edit,
  KeyboardArrowDown,
  Menu as MenuIcon,
  Close,
  Add,
  Search,
  AccessTime,
  Download,
  Upload,
  Logout,
  Check,
  MoreVert,
  EmojiObjects,
  Description,
  Code,
  Lightbulb,
  ChatBubbleOutline,
  MenuBook,
  FlashOn,
  Email,
  TrendingUp,
  Stars,
  School,
  BarChart
} from '@mui/icons-material';

// Custom hook for localStorage
const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return initialValue;
    }
  });

  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error('Error writing to localStorage:', error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
};

// Codeforces API Service
const codeforcesAPI = {
  async getUserInfo(handle) {
    try {
      const response = await fetch(`https://codeforces.com/api/user.info?handles=${handle}`);
      if (!response.ok) throw new Error('Failed to fetch user info');
      const data = await response.json();
      
      if (data.status === 'OK' && data.result.length > 0) {
        return { success: true, data: data.result[0] };
      } else {
        return { success: false, error: data.comment || 'User not found' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async getUserSubmissions(handle) {
    try {
      const response = await fetch(`https://codeforces.com/api/user.status?handle=${handle}&from=1&count=10000`);
      if (!response.ok) throw new Error('Failed to fetch submissions');
      const data = await response.json();
      
      if (data.status === 'OK') {
        return { success: true, data: data.result };
      } else {
        return { success: false, error: data.comment || 'Failed to fetch submissions' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async getProblemsByTags(tags) {
    try {
      // Fetch problems with specific tags
      const response = await fetch(`https://codeforces.com/api/problemset.problems?tags=${tags.join(';')}`);
      if (!response.ok) throw new Error('Failed to fetch problems');
      const data = await response.json();
      
      if (data.status === 'OK') {
        return { success: true, data: data.result.problems };
      } else {
        return { success: false, error: data.comment || 'Failed to fetch problems' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async getRecommendedProblems(weakTags, rating) {
    try {
      // Get problems for weak tags around user's rating level
      const targetRating = rating || 1200;
      const ratingRange = [Math.max(800, targetRating - 200), targetRating + 200];
      
      // First try to get problems with weak tags
      const weakTagResponse = await fetch(
        `https://codeforces.com/api/problemset.problems?tags=${weakTags.slice(0, 3).join(';')}`
      );
      
      if (weakTagResponse.ok) {
        const weakTagData = await weakTagResponse.json();
        if (weakTagData.status === 'OK') {
          // Filter problems by rating and sort
          const filteredProblems = weakTagData.result.problems
            .filter(problem => problem.rating && 
                    problem.rating >= ratingRange[0] && 
                    problem.rating <= ratingRange[1])
            .sort((a, b) => a.rating - b.rating)
            .slice(0, 10);
          
          return { success: true, data: filteredProblems };
        }
      }
      
      // Fallback to general problems
      const generalResponse = await fetch(`https://codeforces.com/api/problemset.problems`);
      if (generalResponse.ok) {
        const generalData = await generalResponse.json();
        if (generalData.status === 'OK') {
          const filteredProblems = generalData.result.problems
            .filter(problem => problem.rating && 
                    problem.rating >= ratingRange[0] && 
                    problem.rating <= ratingRange[1])
            .sort((a, b) => a.rating - b.rating)
            .slice(0, 10);
          
          return { success: true, data: filteredProblems };
        }
      }
      
      return { success: false, error: 'No problems found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Helper function to analyze submissions
const analyzeSubmissions = (submissions) => {
  const solvedProblems = new Set();
  const solvedByTag = {};
  const solvedByRating = {};
  const verdicts = {};
  const languages = {};
  const attemptsPerProblem = new Map();
  const problemStats = new Map();
  let totalAccepted = 0;
  let maxAttempts = 0;
  let totalAttempts = 0;

  submissions.forEach(submission => {
    const problemKey = `${submission.problem.contestId}-${submission.problem.index}`;
    totalAttempts++;
    
    // Track languages
    languages[submission.programmingLanguage] = (languages[submission.programmingLanguage] || 0) + 1;
    
    // Track verdicts
    verdicts[submission.verdict] = (verdicts[submission.verdict] || 0) + 1;
    
    // Initialize problem stats
    if (!problemStats.has(problemKey)) {
      problemStats.set(problemKey, {
        solved: false,
        attempts: 0,
        tags: submission.problem.tags || [],
        rating: submission.problem.rating,
        lastAttempt: submission.creationTimeSeconds
      });
    }
    
    const stats = problemStats.get(problemKey);
    stats.attempts++;
    stats.lastAttempt = Math.max(stats.lastAttempt, submission.creationTimeSeconds);
    
    // Count accepted submissions
    if (submission.verdict === 'OK') {
      stats.solved = true;
      totalAccepted++;
      
      // Count unique solved problems
      if (!solvedProblems.has(problemKey)) {
        solvedProblems.add(problemKey);
        
        // Count by tags
        submission.problem.tags?.forEach(tag => {
          solvedByTag[tag] = (solvedByTag[tag] || 0) + 1;
        });
        
        // Count by rating
        if (submission.problem.rating) {
          const rating = submission.problem.rating;
          solvedByRating[rating] = (solvedByRating[rating] || 0) + 1;
        }
      }
    }
    
    // Update attempts per problem
    attemptsPerProblem.set(problemKey, stats.attempts);
    maxAttempts = Math.max(maxAttempts, stats.attempts);
  });

  // Calculate accuracy per problem
  const problemAccuracy = {};
  problemStats.forEach((stats, problemKey) => {
    if (stats.solved) {
      const accuracy = 1 / stats.attempts;
      stats.tags?.forEach(tag => {
        if (!problemAccuracy[tag]) {
          problemAccuracy[tag] = { total: 0, count: 0 };
        }
        problemAccuracy[tag].total += accuracy;
        problemAccuracy[tag].count++;
      });
    }
  });

  // Calculate average accuracy per tag
  const tagAccuracy = {};
  Object.keys(problemAccuracy).forEach(tag => {
    tagAccuracy[tag] = problemAccuracy[tag].total / problemAccuracy[tag].count;
  });

  // Get top tags
  const topTags = Object.entries(solvedByTag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Get weak tags (lowest solved count)
  const weakTags = Object.entries(solvedByTag)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Get rating distribution
  const ratingDistribution = Object.entries(solvedByRating)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  // Get top languages
  const topLanguages = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Find highest solved rating
  const highestSolvedRating = ratingDistribution.length > 0 
    ? Math.max(...ratingDistribution.map(([rating]) => parseInt(rating)))
    : 0;

  return {
    totalProblemsSolved: solvedProblems.size,
    totalSubmissions: submissions.length,
    totalAccepted,
    totalAttempts,
    solvedByTag,
    solvedByRating,
    verdicts,
    languages,
    topTags,
    weakTags,
    ratingDistribution,
    topLanguages,
    maxAttempts,
    tagAccuracy,
    highestSolvedRating,
    problemStats: Object.fromEntries(problemStats),
    attemptsPerProblem: Object.fromEntries(attemptsPerProblem)
  };
};

// Function to generate AI prompt from Codeforces data
const generateAIRecommendationPrompt = (handle, userData, analysis) => {
  const userRating = userData.rating || 0;
  const userRank = userData.rank || 'unrated';
  
  let prompt = `I have analyzed the Codeforces profile of ${handle}. Here's a detailed analysis:\n\n`;
  
  // Basic user info
  prompt += `User Information:\n`;
  prompt += `- Handle: ${handle}\n`;
  prompt += `- Current Rating: ${userRating} (${userRank})\n`;
  
  // Weakness analysis
  prompt += `\nAreas for Improvement (Weakest Tags):\n`;
  analysis.weakTags.forEach((tag, index) => {
    const solvedCount = analysis.solvedByTag[tag] || 0;
    prompt += `${index + 1}. ${tag}: ${solvedCount} problems solved\n`;
  });
  
  // Rating distribution analysis
  prompt += `\nRating Distribution Analysis:\n`;
  if (analysis.ratingDistribution.length > 0) {
    const ratings = analysis.ratingDistribution.map(([rating]) => parseInt(rating));
    const avgSolvedRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    prompt += `- Average solved problem rating: ${avgSolvedRating.toFixed(0)}\n`;
    prompt += `- Current rating capability: ${userRating}\n`;
    prompt += `- Gap to next level: ${Math.max(0, userRating + 100 - avgSolvedRating).toFixed(0)} rating points\n`;
  }
  
  return prompt;
};

// Format AI responses properly
const formatAIResponse = (text) => {
  if (!text) return '';
  
  // Clean up common formatting issues
  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, '**$1**') // Ensure bold formatting
    .replace(/### (.*?)\n/g, '### $1\n\n') // Add spacing after headers
    .replace(/## (.*?)\n/g, '## $1\n\n') // Add spacing after headers
    .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
    .replace(/^- /gm, '• ') // Convert dashes to bullets
    .replace(/^(\d+)\. /gm, '$1. ') // Keep numbered lists
    .trim();
  
  return formatted;
};

// Fallback recommendations generator
const generateFallbackRecommendations = (handle, userData, analysis) => {
  const userRating = userData.rating || 1200;
  const ratingRange = [Math.max(800, userRating - 100), userRating + 100];
  
  let response = `## Codeforces Analysis for ${handle}\n\n`;
  
  response += `### 📊 Basic Statistics\n`;
  response += `- **Rating**: ${userData.rating || 'Unrated'} (${userData.rank || 'Unranked'})\n`;
  response += `- **Max Rating**: ${userData.maxRating || userData.rating || 'Unrated'}\n`;
  response += `- **Problems Solved**: ${analysis.totalProblemsSolved}\n`;
  response += `- **Acceptance Rate**: ${((analysis.totalAccepted / analysis.totalSubmissions) * 100).toFixed(1)}%\n\n`;
  
  response += `### 🏆 Top Strengths\n`;
  analysis.topTags.slice(0, 3).forEach(([tag, count], index) => {
    response += `${index + 1}. **${tag}**: ${count} problems solved\n`;
  });
  
  response += `\n### 📈 Areas for Improvement\n`;
  analysis.weakTags.slice(0, 3).forEach((tag, index) => {
    const solvedCount = analysis.solvedByTag[tag] || 0;
    response += `${index + 1}. **${tag}**: Only ${solvedCount} problems solved\n`;
  });
  
  response += `\n### 🎯 Recommended Next Steps\n`;
  response += `1. **Target Rating**: Practice problems rated ${ratingRange[0]}-${ratingRange[1]}\n`;
  response += `2. **Weak Areas**: Focus on ${analysis.weakTags[0] || 'dynamic programming'} problems\n`;
  response += `3. **Contest Strategy**: Participate in Div 2 contests regularly\n`;
  response += `4. **Learning Plan**: Solve 5-10 problems daily from different categories\n\n`;
  
  response += `### 💡 Specific Recommendations\n`;
  response += `- **Immediate Focus**: ${analysis.weakTags[0] || 'Graph Theory'} problems\n`;
  response += `- **Problem Count**: Aim for 50 more solves in your weak areas\n`;
  response += `- **Rating Goal**: Target ${userRating + 100} within 2 months\n`;
  response += `- **Resources**: Use Codeforces Edu section for tutorials\n\n`;
  
  response += `### 🔗 Recommended Practice Problems\n`;
  response += `(These are general recommendations - connect to backend for specific problem IDs)\n`;
  response += `1. Search Codeforces for "${analysis.weakTags[0] || 'dp'}" tagged problems at ${ratingRange[0]} rating\n`;
  response += `2. Try recent Div 2 A/B problems to build speed\n`;
  response += `3. Practice virtual contests to simulate real competition\n`;
  
  return response;
};

// Simple CSS styles
const styles = {
  sidebar: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: '260px',
    backgroundColor: '#171717',
    color: 'white',
    zIndex: 50,
    borderRight: '1px solid #2e2e2e',
    transform: 'translateX(-100%)',
    transition: 'transform 200ms ease'
  },
  sidebarOpen: {
    transform: 'translateX(0)'
  },
  sidebarDesktopOpen: {
    position: 'fixed',
    transform: 'translateX(0)'
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 40
  },
  messageContainer: {
    maxWidth: '768px',
    margin: '0 auto',
    padding: '0 16px'
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  inputArea: {
    borderTop: '1px solid #565869',
    backgroundColor: '#343541',
    padding: '16px'
  },
  textarea: {
    width: '100%',
    backgroundColor: '#40414f',
    color: '#ececf1',
    border: '1px solid #565869',
    borderRadius: '12px',
    padding: '16px',
    fontSize: '16px',
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit'
  },
  sendButton: {
    position: 'absolute',
    right: '12px',
    bottom: '12px',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  codeforcesCard: {
    backgroundColor: '#2e2e2e',
    borderRadius: '12px',
    padding: '16px',
    margin: '16px 0',
    border: '1px solid #40414f'
  },
  tagPill: {
    display: 'inline-block',
    backgroundColor: '#10a37f',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    margin: '4px',
    fontWeight: 500
  },
  statCard: {
    backgroundColor: '#40414f',
    borderRadius: '8px',
    padding: '12px',
    margin: '8px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  ratingBadge: {
    display: 'inline-block',
    backgroundColor: '#5436da',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 'bold'
  },
  aiResponse: {
    color: '#ececf1',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    lineHeight: 1.6,
    fontSize: '15px'
  },
  aiHeader: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginTop: '24px',
    marginBottom: '16px',
    color: '#ececf1',
    paddingBottom: '8px',
    borderBottom: '2px solid #10a37f'
  },
  aiSubheader: {
    fontSize: '18px',
    fontWeight: '600',
    marginTop: '20px',
    marginBottom: '12px',
    color: '#ececf1'
  },
  aiList: {
    marginLeft: '20px',
    marginBottom: '16px'
  },
  aiListItem: {
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'flex-start'
  },
  aiBullet: {
    color: '#10a37f',
    marginRight: '8px',
    fontWeight: 'bold'
  },
  aiBold: {
    fontWeight: 'bold',
    color: '#ececf1'
  },
  aiSeparator: {
    height: '1px',
    backgroundColor: '#40414f',
    margin: '24px 0',
    width: '100%'
  }
};

// AI Response Formatter Component
const AIResponseFormatter = React.memo(({ content }) => {
  if (!content) return null;

  // If content already has markdown-like structure, render it
  if (content.includes('##') || content.includes('###') || content.includes('- **') || content.includes('1.')) {
    return (
      <div style={styles.aiResponse}>
        {content.split('\n').map((line, index) => {
          // Handle main headers
          if (line.startsWith('# ')) {
            return (
              <h1 key={index} style={styles.aiHeader}>
                {line.replace('# ', '')}
              </h1>
            );
          }
          
          // Handle subheaders
          if (line.startsWith('## ')) {
            return (
              <h2 key={index} style={{
                fontSize: '18px',
                fontWeight: 'bold',
                marginTop: '20px',
                marginBottom: '12px',
                color: '#ececf1',
                paddingBottom: '4px',
                borderBottom: '1px solid #40414f'
              }}>
                {line.replace('## ', '')}
              </h2>
            );
          }
          
          // Handle sub-subheaders
          if (line.startsWith('### ')) {
            return (
              <h3 key={index} style={{
                fontSize: '16px',
                fontWeight: '600',
                marginTop: '16px',
                marginBottom: '8px',
                color: '#ececf1'
              }}>
                {line.replace('### ', '')}
              </h3>
            );
          }
          
          // Handle emoji headers
          if (line.match(/^[📊🏆📈🎯💡🔗🤖⚡️✨⭐️🎨🚀📚🎮⚙️🔧📱💻🌐🛠️🎪🎭🎨🧩🎲🎯🎪🎭🎨🧩🎲]+/)) {
            return (
              <h3 key={index} style={{
                fontSize: '16px',
                fontWeight: '600',
                marginTop: '16px',
                marginBottom: '8px',
                color: '#ececf1',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {line}
              </h3>
            );
          }
          
          // Handle bullet points with bold
          if (line.startsWith('- **') || line.startsWith('• **')) {
            const text = line.replace(/^[-•]\s+/, '');
            return (
              <div key={index} style={styles.aiListItem}>
                <span style={styles.aiBullet}>•</span>
                <span dangerouslySetInnerHTML={{
                  __html: text.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: bold; color: #ececf1;">$1</strong>')
                }} />
              </div>
            );
          }
          
          // Handle numbered lists
          if (line.match(/^\d+\.\s+\*\*/)) {
            const match = line.match(/^(\d+)\.\s+(.*)/);
            return (
              <div key={index} style={styles.aiListItem}>
                <span style={{
                  ...styles.aiBullet,
                  minWidth: '24px'
                }}>
                  {match[1]}.
                </span>
                <span dangerouslySetInnerHTML={{
                  __html: match[2].replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: bold; color: #ececf1;">$1</strong>')
                }} />
              </div>
            );
          }
          
          // Handle regular numbered lists
          if (line.match(/^\d+\.\s+/)) {
            const match = line.match(/^(\d+)\.\s+(.*)/);
            return (
              <div key={index} style={styles.aiListItem}>
                <span style={{
                  ...styles.aiBullet,
                  minWidth: '24px'
                }}>
                  {match[1]}.
                </span>
                <span>{match[2]}</span>
              </div>
            );
          }
          
          // Handle regular bullet points
          if (line.startsWith('- ') || line.startsWith('• ')) {
            return (
              <div key={index} style={styles.aiListItem}>
                <span style={styles.aiBullet}>•</span>
                <span>{line.replace(/^[-•]\s+/, '')}</span>
              </div>
            );
          }
          
          // Handle bold text in paragraphs
          if (line.includes('**')) {
            return (
              <p key={index} style={{ marginBottom: '12px' }}>
                <span dangerouslySetInnerHTML={{
                  __html: line.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: bold; color: #ececf1;">$1</strong>')
                }} />
              </p>
            );
          }
          
          // Handle separator lines
          if (line.startsWith('---') || line.startsWith('***') || line.startsWith('___')) {
            return (
              <hr key={index} style={styles.aiSeparator} />
            );
          }
          
          // Handle regular paragraphs (non-empty lines)
          if (line.trim()) {
            return (
              <p key={index} style={{ marginBottom: '12px' }}>
                {line}
              </p>
            );
          }
          
          // Handle empty lines as spacing
          return <div key={index} style={{ height: '12px' }} />;
        })}
      </div>
    );
  }

  // Simple text formatting for plain responses
  return (
    <div style={styles.aiResponse}>
      {content.split('\n').map((line, index) => (
        <p key={index} style={{ marginBottom: '12px' }}>
          {line}
        </p>
      ))}
    </div>
  );
});

AIResponseFormatter.displayName = 'AIResponseFormatter';

// Sidebar Component
const Sidebar = React.memo(({ 
  isOpen, 
  onClose, 
  conversations, 
  currentConversationId, 
  onSelectConversation, 
  onDeleteConversation,
  onNewChat,
  user,
  onLogout,
  isDesktop
}) => {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && !isDesktop && (
        <div 
          style={styles.overlay}
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div 
        style={{
          ...styles.sidebar,
          ...(isOpen ? (isDesktop ? styles.sidebarDesktopOpen : styles.sidebarOpen) : {})
        }}
        className="flex flex-col"
      >
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid #2e2e2e' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <button
              onClick={onNewChat}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#10a37f',
                color: 'white',
                borderRadius: '8px',
                border: 'none',
                width: '100%',
                cursor: 'pointer'
              }}
            >
              <Add style={{ width: '16px', height: '16px' }} />
              <span style={{ fontSize: '14px', fontWeight: 500 }}>New chat</span>
            </button>
            {/* Show close button only on mobile */}
            {!isDesktop && (
              <button
                onClick={onClose}
                style={{
                  marginLeft: '8px',
                  padding: '8px',
                  border: 'none',
                  background: 'none',
                  color: '#ececf1',
                  cursor: 'pointer'
                }}
              >
                <Close style={{ width: '20px', height: '20px' }} />
              </button>
            )}
          </div>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {conversations.length === 0 ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              padding: '16px',
              textAlign: 'center'
            }}>
              <ChatBubbleOutline style={{ 
                width: '48px', 
                height: '48px', 
                color: '#4a4a57',
                marginBottom: '12px'
              }} />
              <p style={{ color: '#8e8ea0', fontSize: '14px' }}>
                No conversations yet
              </p>
              <p style={{ color: '#6e6e80', fontSize: '12px', marginTop: '4px' }}>
                Start a new chat to see it here
              </p>
            </div>
          ) : (
            <div style={{ padding: '0 8px' }}>
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: 'none',
                    background: conv.id === currentConversationId ? '#2e2e2e' : 'transparent',
                    color: conv.id === currentConversationId ? '#ececf1' : '#8e8ea0',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                    <ChatBubbleOutline style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    <span style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.title}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#8e8ea0' }}>{formatTime(conv.lastUpdated)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      style={{
                        padding: '4px',
                        border: 'none',
                        background: 'none',
                        color: '#8e8ea0',
                        cursor: 'pointer'
                      }}
                    >
                      <Delete style={{ width: '12px', height: '12px' }} />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px', borderTop: '1px solid #2e2e2e' }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', color: '#8e8ea0' }}>
              <Code style={{ width: '16px', height: '16px' }} />
              <span style={{ fontSize: '14px' }}>Codeforces AI</span>
            </div>
            {user && (
              <div style={{ fontSize: '12px', color: '#8e8ea0', padding: '0 12px' }}>
                {user.email}
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              onClick={onLogout}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: '14px',
                color: '#8e8ea0',
                border: 'none',
                background: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <Logout style={{ width: '16px', height: '16px' }} />
              Log out
            </button>
          </div>
        </div>
      </div>
    </>
  );
});

Sidebar.displayName = 'Sidebar';

// Message Component with AI Response Formatter
const Message = React.memo(({ message, onCopy, isTyping = false, customAvatar = null }) => {
  const isUser = message.role === 'user';
  const isAI = !isUser;

  if (isTyping) {
    return (
      <div style={{ padding: '24px 0' }}>
        <div style={styles.messageContainer}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{
              ...styles.avatar,
              background: customAvatar ? 'transparent' : 'linear-gradient(135deg, #10a37f, #0d8c6d)',
              overflow: customAvatar ? 'hidden' : 'visible'
            }}>
              {customAvatar ? (
                <img 
                  src={customAvatar}
                  alt="Codeforces Avatar"
                  style={{ width: '20px', height: '20px', borderRadius: '50%' }}
                />
              ) : (
                <SmartToy style={{ width: '20px', height: '20px', color: 'white' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#8e8ea0' }}>
                  {customAvatar ? 'Hitokiri AI' : 'Codeforces AI'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ 
                  width: '8px', 
                  height: '8px', 
                  backgroundColor: '#8e8ea0',
                  borderRadius: '50%',
                  animation: 'pulse 1.5s infinite'
                }} />
                <div style={{ 
                  width: '8px', 
                  height: '8px', 
                  backgroundColor: '#8e8ea0',
                  borderRadius: '50%',
                  animation: 'pulse 1.5s infinite 0.2s'
                }} />
                <div style={{ 
                  width: '8px', 
                  height: '8px', 
                  backgroundColor: '#8e8ea0',
                  borderRadius: '50%',
                  animation: 'pulse 1.5s infinite 0.4s'
                }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '24px 0',
      backgroundColor: isUser ? 'transparent' : 'transparent',
      color: '#ececf1'
    }}>
      <div style={styles.messageContainer}>
        <div style={{ display: 'flex', gap: '16px' }}>
          {/* Avatar */}
          <div style={{
            ...styles.avatar,
            background: isUser 
              ? 'linear-gradient(135deg, #5436da, #3c2aa3)' 
              : customAvatar ? 'transparent' : 'linear-gradient(135deg, #10a37f, #0d8c6d)',
            overflow: customAvatar ? 'hidden' : 'visible'
          }}>
            {isUser ? (
              <Person style={{ width: '16px', height: '16px', color: 'white' }} />
            ) : customAvatar ? (
              <img 
                src={customAvatar}
                alt="Codeforces Avatar"
                style={{ width: '20px', height: '20px', borderRadius: '50%' }}
              />
            ) : (
              <SmartToy style={{ width: '16px', height: '16px', color: 'white' }} />
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#8e8ea0' }}>
                {isUser ? 'You' : (customAvatar ? 'Hitokiri AI' : 'Codeforces AI')}
              </span>
              <span style={{ fontSize: '12px', color: '#8e8ea0' }}>
                {new Date(message.timestamp).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            </div>

            {/* Message Content - Use AIResponseFormatter for AI messages */}
            {isAI ? (
              <AIResponseFormatter content={message.content} />
            ) : (
              <div style={{ 
                color: '#ececf1', 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                lineHeight: '1.6'
              }}>
                {message.content}
              </div>
            )}

            {/* Actions */}
            {isAI && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                <button
                  onClick={() => onCopy(message.content)}
                  style={{
                    padding: '6px',
                    border: 'none',
                    background: 'none',
                    color: '#8e8ea0',
                    cursor: 'pointer',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ececf1'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#8e8ea0'}
                  title="Copy"
                >
                  <ContentCopy style={{ width: '16px', height: '16px' }} />
                </button>
                <button
                  style={{
                    padding: '6px',
                    border: 'none',
                    background: 'none',
                    color: '#8e8ea0',
                    cursor: 'pointer',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ececf1'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#8e8ea0'}
                  title="Good response"
                >
                  <ThumbUp style={{ width: '16px', height: '16px' }} />
                </button>
                <button
                  style={{
                    padding: '6px',
                    border: 'none',
                    background: 'none',
                    color: '#8e8ea0',
                    cursor: 'pointer',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ececf1'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#8e8ea0'}
                  title="Bad response"
                >
                  <ThumbDown style={{ width: '16px', height: '16px' }} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

Message.displayName = 'Message';

// Codeforces User Info Component
const CodeforcesUserInfo = React.memo(({ userData, analysis }) => {
  if (!userData) return null;

  const getRatingColor = (rating) => {
    if (rating >= 2400) return '#FF0000'; // Red
    if (rating >= 2100) return '#FF8C00'; // Orange
    if (rating >= 1900) return '#AA00AA'; // Violet
    if (rating >= 1600) return '#0000FF'; // Blue
    if (rating >= 1400) return '#03A89E'; // Cyan
    if (rating >= 1200) return '#008000'; // Green
    return '#808080'; // Gray
  };

  return (
    <div style={styles.codeforcesCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          overflow: 'hidden',
          border: `3px solid ${getRatingColor(userData.rating || 0)}`
        }}>
          <img 
            src={userData.avatar || `https://ui-avatars.com/api/?name=${userData.handle}&background=random`}
            alt={userData.handle}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <div>
          <h3 style={{ 
            fontSize: '20px', 
            fontWeight: 'bold', 
            color: getRatingColor(userData.rating || 0),
            marginBottom: '4px'
          }}>
            {userData.handle}
          </h3>
          <p style={{ color: '#8e8ea0', fontSize: '14px' }}>
            {userData.firstName} {userData.lastName}
          </p>
          <p style={{ color: '#8e8ea0', fontSize: '12px' }}>
            {userData.organization || 'No organization'}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={styles.statCard}>
          <TrendingUp style={{ color: '#10a37f' }} />
          <div>
            <div style={{ fontSize: '12px', color: '#8e8ea0' }}>Rating</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ececf1' }}>
              {userData.rating || 'Unrated'}
            </div>
          </div>
        </div>
        <div style={styles.statCard}>
          <Stars style={{ color: '#10a37f' }} />
          <div>
            <div style={{ fontSize: '12px', color: '#8e8ea0' }}>Max Rating</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ececf1' }}>
              {userData.maxRating || 'Unrated'}
            </div>
          </div>
        </div>
        <div style={styles.statCard}>
          <BarChart style={{ color: '#10a37f' }} />
          <div>
            <div style={{ fontSize: '12px', color: '#8e8ea0' }}>Problems Solved</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ececf1' }}>
              {analysis?.totalProblemsSolved || 0}
            </div>
          </div>
        </div>
        <div style={styles.statCard}>
          <School style={{ color: '#10a37f' }} />
          <div>
            <div style={{ fontSize: '12px', color: '#8e8ea0' }}>Rank</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ececf1' }}>
              {userData.rank || 'Unranked'}
            </div>
          </div>
        </div>
      </div>

      {/* Problem Tags Analysis */}
      {analysis && analysis.topTags.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#ececf1', marginBottom: '8px' }}>
            Top Problem Tags
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {analysis.topTags.map(([tag, count]) => (
              <div key={tag} style={styles.tagPill}>
                {tag}: {count}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rating Distribution */}
      {analysis && analysis.ratingDistribution.length > 0 && (
        <div>
          <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#ececf1', marginBottom: '8px' }}>
            Solved by Rating
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {analysis.ratingDistribution.map(([rating, count]) => (
              <div key={rating} style={{
                ...styles.ratingBadge,
                backgroundColor: getRatingColor(parseInt(rating))
              }}>
                {rating}: {count}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

CodeforcesUserInfo.displayName = 'CodeforcesUserInfo';

// Input Area Component
const InputArea = React.memo(({ 
  value, 
  onChange, 
  onSend, 
  loading, 
  placeholder,
  inputRef
}) => {
  const [rows, setRows] = useState(1);

  const handleChange = (e) => {
    const textarea = e.target;
    const newRows = Math.min(Math.max(textarea.value.split('\n').length, 1), 6);
    setRows(newRows);
    onChange(e);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault();
      onSend();
    }
  };

  return (
   <div style={styles.inputArea}>
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
    <div style={{ 
  position: 'relative',
  width: '100%'
}}>
  <textarea
    ref={inputRef}
    value={value}
    onChange={handleChange}
    onKeyDown={handleKeyDown}
    placeholder={placeholder}
    disabled={loading}
    rows={rows}
    style={{
      ...styles.textarea,
      paddingRight: '40px',
      width: '100%',
      boxSizing: 'border-box',
      minHeight: '56px', // Ensure minimum height
      maxHeight: '200px' // Limit maximum height
    }}
  />
  <button
    onClick={onSend}
    disabled={loading || !value.trim()}
    style={{
      position: 'absolute',
      right: '8px',
      top: '50%', // Center vertically instead of bottom
      transform: 'translateY(-50%)', // Center vertically
      width: '28px',
      height: '28px',
      borderRadius: '6px',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: value.trim() && !loading ? '#10a37f' : '#565869',
      color: value.trim() && !loading ? 'white' : '#8e8ea0',
      cursor: value.trim() && !loading ? 'pointer' : 'not-allowed',
      zIndex: 10,
      transition: 'background-color 0.2s'
    }}
  >
    {loading ? (
      <div style={{ 
        width: '14px', 
        height: '14px', 
        border: '2px solid white', 
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
    ) : (
      <Send style={{ width: '14px', height: '14px' }} />
    )}
  </button>
</div>
        
        <p style={{ 
          textAlign: 'center', 
          fontSize: '12px', 
          color: '#8e8ea0',
          marginTop: '12px'
        }}>
          Type "cf [handle]" to search Codeforces profiles (e.g., "cf tourist")
        </p>
      </div>
    </div>
  );
});

InputArea.displayName = 'InputArea';

// Mobile Header Component
const MobileHeader = React.memo(({ onToggleSidebar, onNewChat }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px',
      backgroundColor: '#171717',
      borderBottom: '1px solid #2e2e2e'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onToggleSidebar}
          style={{
            padding: '8px',
            border: 'none',
            background: 'none',
            color: '#ececf1',
            cursor: 'pointer'
          }}
        >
          <MenuIcon style={{ width: '20px', height: '20px' }} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #10a37f, #0d8c6d)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Code style={{ width: '16px', height: '16px', color: 'white' }} />
          </div>
          <span style={{ fontSize: '16px', fontWeight: 500, color: '#ececf1' }}>Codeforces AI</span>
        </div>
      </div>
      <button
        onClick={onNewChat}
        style={{
          padding: '8px',
          border: 'none',
          background: 'none',
          color: '#ececf1',
          cursor: 'pointer'
        }}
      >
        <Add style={{ width: '20px', height: '20px' }} />
      </button>
    </div>
  );
});

MobileHeader.displayName = 'MobileHeader';

// Main Dashboard Component - Fixed for natural scrolling
const Dashboard = () => {
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [conversationsHistory, setConversationsHistory] = useLocalStorage('deepseek_conversations', []);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [codeforcesUser, setCodeforcesUser] = useState(null);
  const [codeforcesAnalysis, setCodeforcesAnalysis] = useState(null);
  const [showUserCard, setShowUserCard] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(null);
  
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Check if desktop on mount and resize
  useEffect(() => {
    const checkIfDesktop = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      // Auto-open sidebar on desktop
      if (desktop && !sidebarOpen) {
        setSidebarOpen(true);
      }
    };
    
    checkIfDesktop();
    window.addEventListener('resize', checkIfDesktop);
    
    return () => window.removeEventListener('resize', checkIfDesktop);
  }, [sidebarOpen]);

  // Effects
  useEffect(() => {
    const currentUser = authAPI.getCurrentUser();
    if (!currentUser) {
      navigate('/login');
      return;
    }
    setUser(currentUser);
    startNewConversation();
  }, [navigate]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0; // Scroll to top for new analysis
    }
  }, [showUserCard]); // Scroll to top when user card appears

  // Functions
  const startNewConversation = useCallback(() => {
    const newConversationId = Date.now().toString();
    setCurrentConversationId(newConversationId);
    setConversation([{
      id: 'welcome',
      role: 'assistant',
      content: '## 👋 Hello! I\'m Codeforces AI Assistant\n\nI can help you analyze Codeforces profiles and provide personalized recommendations.\n\n**To get started:**\n• Type "cf [handle]" to search for a user (e.g., "cf tourist")\n• Ask me anything about competitive programming\n• Get tips to improve your rating\n\nLet\'s analyze your first Codeforces profile! 🚀',
      timestamp: new Date().toISOString()
    }]);
    
    // Clear any existing Codeforces data
    setCodeforcesUser(null);
    setCodeforcesAnalysis(null);
    setShowUserCard(false);
    setPendingAnalysis(null);
    
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const loadConversation = useCallback((conversationId) => {
    const conversation = conversationsHistory.find(c => c.id === conversationId);
    if (conversation) {
      setCurrentConversationId(conversationId);
      setConversation(conversation.messages);
      // Close sidebar on mobile when selecting conversation
      if (!isDesktop) {
        setSidebarOpen(false);
      }
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [conversationsHistory, isDesktop]);

  const saveCurrentConversation = useCallback(() => {
    if (conversation.length <= 1) return;
    
    const updatedHistory = conversationsHistory.filter(c => c.id !== currentConversationId);
    const conversationToSave = {
      id: currentConversationId,
      title: conversation[1]?.content?.substring(0, 50) + (conversation[1]?.content?.length > 50 ? '...' : '') || 'New Conversation',
      messages: conversation,
      lastUpdated: new Date().toISOString()
    };
    
    const newHistory = [conversationToSave, ...updatedHistory].slice(0, 50);
    setConversationsHistory(newHistory);
  }, [conversation, currentConversationId, conversationsHistory, setConversationsHistory]);

  const fetchCodeforcesUser = useCallback(async (handle) => {
    setLoading(true);
    setIsTyping(true);
    
    try {
      // Fetch user info
      const userInfo = await codeforcesAPI.getUserInfo(handle);
      
      if (!userInfo.success) {
        toast.error(`Failed to fetch user: ${userInfo.error}`);
        setConversation(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `## ❌ User Not Found\n\nSorry, I couldn't find Codeforces user **"${handle}"**.\n\n**Error:** ${userInfo.error}\n\nPlease check the handle and try again.`,
          timestamp: new Date().toISOString()
        }]);
        return;
      }
      
      // Fetch user submissions
      const submissions = await codeforcesAPI.getUserSubmissions(handle);
      
      if (!submissions.success) {
        toast.error(`Failed to fetch submissions: ${submissions.error}`);
        setConversation(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `## ⚠️ Limited Analysis\n\nFound user **"${handle}"** but couldn't fetch submission history.\n\n**Error:** ${submissions.error}\n\nYou can still see basic user info above.`,
          timestamp: new Date().toISOString()
        }]);
        // Still set user info even if submissions fail
        setCodeforcesUser(userInfo.data);
        setShowUserCard(true);
        return;
      }
      
      // Analyze submissions
      const analysis = analyzeSubmissions(submissions.data);
      
      // Update state - show the user card immediately
      setCodeforcesUser(userInfo.data);
      setCodeforcesAnalysis(analysis);
      setShowUserCard(true);
      
      // Store analysis for AI to use
      setPendingAnalysis({ handle, userData: userInfo.data, analysis });
      
      // Generate the prompt for DeepSeek API
      const prompt = generateAIRecommendationPrompt(handle, userInfo.data, analysis);
      
      // Call DeepSeek API through your existing service
      const aiResult = await deepseekAPI.generate('codeforces_analysis', prompt);
      
      // Create AI analysis message (just the recommendations)
      let assistantMessageContent = `## 🤖 AI-Powered Recommendations\n\n`;
      
      // Add AI-generated recommendations
      if (aiResult.success) {
        toast.success(`✅ Successfully analyzed ${handle}'s profile!`);
        
        // Format the AI response
        const formattedAIResponse = formatAIResponse(aiResult.data);
        
        // Check if response already has headers
        if (!formattedAIResponse.includes('##')) {
          assistantMessageContent += formattedAIResponse;
        } else {
          assistantMessageContent += formattedAIResponse;
        }
      } else {
        // Use formatted fallback recommendations
        assistantMessageContent += `Based on the analysis above, here are my recommendations:\n\n`;
        const userRating = userInfo.data.rating || 1200;
        const ratingRange = [Math.max(800, userRating - 100), userRating + 100];
        
        assistantMessageContent += `### 🎯 Focus Areas\n`;
        assistantMessageContent += `1. **Target Rating Range:** Practice problems rated **${ratingRange[0]}-${ratingRange[1]}**\n`;
        assistantMessageContent += `2. **Weak Areas:** Focus on **${analysis.weakTags[0] || 'dynamic programming'}** problems\n`;
        assistantMessageContent += `3. **Contest Strategy:** Participate in **2 Div 2 contests per week**\n\n`;
        
        assistantMessageContent += `### 📚 Study Plan\n`;
        assistantMessageContent += `- **Daily:** Solve 5-10 problems from different categories\n`;
        assistantMessageContent += `- **Weekly:** Review 2-3 contest problems you couldn't solve\n`;
        assistantMessageContent += `- **Monthly:** Aim for **${userRating + 100}** rating\n\n`;
        
        assistantMessageContent += `### 💡 Pro Tips\n`;
        assistantMessageContent += `• Practice virtual contests to improve speed\n`;
        assistantMessageContent += `• Focus on problem-solving patterns, not just solutions\n`;
        assistantMessageContent += `• Join Codeforces Edu for structured learning\n`;
        
        toast.info('Using fallback recommendations');
      }
      
      // Add footer with timestamp
      assistantMessageContent += `\n---\n\n*AI analysis completed • ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}*`;
      
      // Add to conversation
      const assistantMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: assistantMessageContent,
        timestamp: new Date().toISOString()
      };
      
      setConversation(prev => [...prev, assistantMessage]);
      saveCurrentConversation();
      
    } catch (error) {
      console.error('Codeforces fetch error:', error);
      toast.error('Failed to fetch Codeforces data');
      
      // Formatted error message
      const errorMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `## ⚠️ Analysis Error\n\nSorry, I encountered an error while analyzing **"${handle}"**.\n\n**Error:** ${error.message}\n\nPlease try:\n1. Check the handle spelling\n2. Try again in a few minutes\n3. Contact support if issue persists`,
        timestamp: new Date().toISOString()
      };
      
      setConversation(prev => [...prev, errorMessage]);
      
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  }, [saveCurrentConversation]);

  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || loading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString()
    };

    const updatedConversation = [...conversation, userMessage];
    setConversation(updatedConversation);
    
    // Check if it's a Codeforces search request
    const lowerInput = userInput.toLowerCase().trim();
    
    if (lowerInput.startsWith('cf ') && lowerInput.length > 3) {
      const handle = userInput.substring(3).trim();
      setUserInput('');
      
      // Clear previous Codeforces data and hide card
      setCodeforcesUser(null);
      setCodeforcesAnalysis(null);
      setShowUserCard(false);
      setPendingAnalysis(null);
      
      await fetchCodeforcesUser(handle);
      return;
    }
    
    setUserInput('');
    setIsTyping(true);
    setLoading(true);

    try {
      const result = await deepseekAPI.generate('general_chat', userInput);
      
      let assistantContent = '';
      if (result.success) {
        assistantContent = formatAIResponse(result.data);
        // Add AI header if missing
        if (!assistantContent.includes('##') && !assistantContent.includes('###')) {
          assistantContent = `### 🤖 AI Response\n\n${assistantContent}`;
        }
      } else {
        assistantContent = `## ⚠️ Service Error\n\nI apologize, but I encountered an error: ${result.error || 'Please try again.'}`;
      }
      
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString()
      };
      
      const finalConversation = [...updatedConversation, assistantMessage];
      setConversation(finalConversation);
      
      if (result.success) {
        toast.success('Response received');
      } else {
        toast.error('Failed to get response');
      }
      
      saveCurrentConversation();
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Network error. Please try again.');
      
      // Fallback response
      const fallbackResponse = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `## ⚠️ Service Unavailable\n\nI received your message: "${userInput}".\n\nThe AI service might be temporarily unavailable.\n\n**For Codeforces analysis, try typing:**\n• "cf [username]" (e.g., "cf tourist")\n• "cf tourist" - Analyze a top competitor\n• "cf [your-handle]" - Analyze your own profile`,
        timestamp: new Date().toISOString()
      };
      
      const finalConversation = [...updatedConversation, fallbackResponse];
      setConversation(finalConversation);
      saveCurrentConversation();
    } finally {
      setIsTyping(false);
      setLoading(false);
    }
  }, [userInput, loading, conversation, saveCurrentConversation, fetchCodeforcesUser]);

  const handleDeleteConversation = useCallback((conversationId) => {
    const updatedHistory = conversationsHistory.filter(c => c.id !== conversationId);
    setConversationsHistory(updatedHistory);
    
    if (conversationId === currentConversationId) {
      // Clear Codeforces data when deleting current conversation
      setCodeforcesUser(null);
      setCodeforcesAnalysis(null);
      setShowUserCard(false);
      setPendingAnalysis(null);
      startNewConversation();
    }
    
    toast.success('Conversation deleted');
  }, [conversationsHistory, setConversationsHistory, currentConversationId, startNewConversation]);

  const handleCopyMessage = useCallback((content) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard');
  }, []);

  const handleLogout = useCallback(() => {
    authAPI.logout();
    navigate('/login');
    toast.success('Logged out successfully');
  }, [navigate]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  // Add CSS animations
  useEffect(() => {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      /* Smooth scrolling */
      .smooth-scroll {
        scroll-behavior: smooth;
      }
      
      /* Selection color */
      ::selection {
        background-color: #10a37f;
        color: white;
      }
      
      /* Scrollbar styling */
      ::-webkit-scrollbar {
        width: 8px;
      }
      
      ::-webkit-scrollbar-track {
        background: #2e2e2e;
      }
      
      ::-webkit-scrollbar-thumb {
        background: #565869;
        border-radius: 4px;
      }
      
      ::-webkit-scrollbar-thumb:hover {
        background: #10a37f;
      }
      
      /* Slide down animation for user card */
      @keyframes slideDown {
        from { 
          opacity: 0; 
          transform: translateY(-20px); 
        }
        to { 
          opacity: 1; 
          transform: translateY(0); 
        }
      }
      
      .slide-down {
        animation: slideDown 0.4s ease-out forwards;
      }
      
      /* Floating user card styles */
      .user-card-container {
        position: relative;
        z-index: 5;
      }
      
      .user-card-close {
        position: absolute;
        top: 12px;
        right: 12px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justifyContent: center;
        cursor: pointer;
        border: none;
        color: #8e8ea0;
        transition: all 0.2s;
      }
      
      .user-card-close:hover {
        background: rgba(0, 0, 0, 0.5);
        color: #ececf1;
      }
      
      /* Mobile optimization */
      @media (max-width: 768px) {
        .user-card-container {
          margin: 12px;
          border-radius: 12px;
        }
      }
      
      /* Analysis flow container */
      .analysis-flow {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      
      /* Scroll hint animation */
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }
      
      .scroll-hint {
        animation: bounce 2s infinite;
      }
    `;
    document.head.appendChild(styleSheet);
    
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  // Create an enhanced user card component
  const EnhancedUserCard = React.memo(({ userData, analysis, onClose }) => {
    if (!userData) return null;

    const getRatingColor = (rating) => {
      if (rating >= 2400) return '#FF0000'; // Red
      if (rating >= 2100) return '#FF8C00'; // Orange
      if (rating >= 1900) return '#AA00AA'; // Violet
      if (rating >= 1600) return '#0000FF'; // Blue
      if (rating >= 1400) return '#03A89E'; // Cyan
      if (rating >= 1200) return '#008000'; // Green
      return '#808080'; // Gray
    };

    const ratingColor = getRatingColor(userData.rating || 0);
    
    return (
      <div className="slide-down">
        <div style={{
          backgroundColor: '#2e2e2e',
          borderRadius: '16px',
          padding: '20px',
          border: '1px solid #40414f',
          position: 'relative',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          marginBottom: '20px'
        }}>
          {/* Close button */}
          <button
            onClick={onClose}
            className="user-card-close"
            title="Close user card"
          >
            <Close style={{ width: '14px', height: '14px' }} />
          </button>
          
          {/* Header */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: `3px solid ${ratingColor}`,
                flexShrink: 0
              }}>
                <img 
                  src={userData.avatar || `https://ui-avatars.com/api/?name=${userData.handle}&background=${ratingColor.replace('#', '')}&color=fff`}
                  alt={userData.handle}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div>
                <h3 style={{ 
                  fontSize: '20px', 
                  fontWeight: 'bold', 
                  color: ratingColor,
                  margin: 0
                }}>
                  {userData.handle}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 'bold',
                    backgroundColor: ratingColor,
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: '12px'
                  }}>
                    {userData.rank || 'Unranked'}
                  </span>
                  <span style={{ fontSize: '12px', color: '#8e8ea0' }}>
                    {userData.rating || 'Unrated'} rating
                  </span>
                </div>
              </div>
            </div>
            
            {userData.maxRating && userData.maxRating !== userData.rating && (
              <div style={{
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px'
              }}>
                <span style={{ color: '#8e8ea0' }}>Max: </span>
                <span style={{ color: ratingColor, fontWeight: 'bold' }}>{userData.maxRating}</span>
              </div>
            )}
          </div>

          {/* Stats Grid */}
          {analysis && (
            <>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: '12px',
                marginBottom: '20px'
              }}>
                <div style={styles.statCard}>
                  <BarChart style={{ color: '#10a37f' }} />
                  <div>
                    <div style={{ fontSize: '12px', color: '#8e8ea0' }}>Problems Solved</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ececf1' }}>
                      {analysis.totalProblemsSolved}
                    </div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <TrendingUp style={{ color: '#10a37f' }} />
                  <div>
                    <div style={{ fontSize: '12px', color: '#8e8ea0' }}>Acceptance Rate</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10a37f' }}>
                      {((analysis.totalAccepted / analysis.totalSubmissions) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <Code style={{ color: '#10a37f' }} />
                  <div>
                    <div style={{ fontSize: '12px', color: '#8e8ea0' }}>Total Submissions</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ececf1' }}>
                      {analysis.totalSubmissions}
                    </div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <Stars style={{ color: '#10a37f' }} />
                  <div>
                    <div style={{ fontSize: '12px', color: '#8e8ea0' }}>Highest Solved</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: getRatingColor(analysis.highestSolvedRating || 0) }}>
                      {analysis.highestSolvedRating || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Problem Tags */}
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#ececf1', marginBottom: '8px' }}>
                  Top Problem Tags
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {analysis.topTags.map(([tag, count]) => (
                    <div key={tag} style={styles.tagPill}>
                      {tag}: {count}
                    </div>
                  ))}
                </div>
              </div>

              {/* Weak Tags */}
              {analysis.weakTags.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#ececf1', marginBottom: '8px' }}>
                    Areas for Improvement
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {analysis.weakTags.slice(0, 5).map((tag) => {
                      const solvedCount = analysis.solvedByTag[tag] || 0;
                      return (
                        <div key={tag} style={{
                          ...styles.tagPill,
                          backgroundColor: 'rgba(255, 107, 107, 0.2)',
                          color: '#ff6b6b',
                          border: '1px solid rgba(255, 107, 107, 0.3)'
                        }}>
                          {tag}: {solvedCount}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          
          {/* Scroll hint */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid #40414f',
            fontSize: '12px',
            color: '#8e8ea0',
            gap: '8px'
          }}>
            <KeyboardArrowDown className="scroll-hint" style={{ fontSize: '16px' }} />
            <span>Scroll down for AI recommendations</span>
            <KeyboardArrowDown className="scroll-hint" style={{ fontSize: '16px' }} />
          </div>
        </div>
      </div>
    );
  });

  EnhancedUserCard.displayName = 'EnhancedUserCard';

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      overflow: 'hidden',
      backgroundColor: '#343541',
      position: 'fixed',
      left: '0',
      top: '0'
    }}>
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversationsHistory}
        currentConversationId={currentConversationId}
        onSelectConversation={loadConversation}
        onDeleteConversation={handleDeleteConversation}
        onNewChat={() => {
          setCodeforcesUser(null);
          setCodeforcesAnalysis(null);
          setShowUserCard(false);
          startNewConversation();
        }}
        user={user}
        onLogout={handleLogout}
        isDesktop={isDesktop}
      />

      {/* Main Content */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        marginLeft: isDesktop && sidebarOpen ? '260px' : '0',
        transition: 'margin-left 200ms ease',
        width: '100%'
      }}>
        {/* Mobile Header - only show on mobile */}
        {!isDesktop && (
          <MobileHeader
            onToggleSidebar={toggleSidebar}
            onNewChat={startNewConversation}
          />
        )}

        {/* Messages Container - Scrollable Area */}
        <div
          ref={messagesContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            backgroundColor: '#343541',
            width: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}
          className="smooth-scroll"
        >
          {/* Main content area with proper spacing */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100%',
            padding: '20px 0'
          }}>
            {/* Independent User Card at the TOP - FIRST THING USER SEES */}
            {showUserCard && codeforcesUser && (
              <div style={{
                maxWidth: '768px',
                margin: '0 auto 20px auto',
                width: '100%',
                padding: '0 16px'
              }}>
                <EnhancedUserCard 
                  userData={codeforcesUser} 
                  analysis={codeforcesAnalysis}
                  onClose={() => setShowUserCard(false)}
                />
              </div>
            )}
            
            {/* Regular conversation messages BELOW the card */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              maxWidth: '768px',
              margin: '0 auto',
              width: '100%',
              padding: '0 16px'
            }}>
              {conversation.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  onCopy={handleCopyMessage}
                />
              ))}
              
              {/* Typing Indicator - at the BOTTOM of conversation */}
              {isTyping && (
                <Message
                  message={{ role: 'assistant', content: '' }}
                  onCopy={() => {}}
                  isTyping={true}
                />
              )}
            </div>
          </div>
        </div>

        {/* Input Area - Fixed at bottom */}
        <InputArea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onSend={handleSendMessage}
          loading={loading}
          placeholder="Type 'cf [handle]' to search Codeforces or ask a question..."
          inputRef={inputRef}
        />
      </div>
    </div>
  );
};

export default Dashboard;