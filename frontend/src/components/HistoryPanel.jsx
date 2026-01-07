import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  IconButton,
  Divider,
  CircularProgress,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  Tooltip
} from '@mui/material';
import {
  History,
  Close,
  Search,
  Business,
  Code,
  Campaign,
  ChatBubble,
  School,
  Psychology,
  Lightbulb,
  Email,
  Visibility,
  ContentCopy,
  TrendingUp
} from '@mui/icons-material';
import { deepseekAPI } from '../services/api';
import toast from 'react-hot-toast';

const HistoryPanel = ({ open, onClose }) => {
  const [generations, setGenerations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGeneration, setSelectedGeneration] = useState(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (open) {
      loadHistory();
      loadStats();
    }
  }, [open, selectedTab]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const promptType = selectedTab === 0 ? '' : getPromptTypeFromTab(selectedTab);
      const result = await deepseekAPI.getHistory(50, 0, promptType);
      if (result.success) {
        setGenerations(result.generations);
      }
    } catch (error) {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const result = await deepseekAPI.getStats();
      if (result.success) {
        setStats(result.stats);
      }
    } catch (error) {
      console.log('Failed to load stats:', error);
    }
  };

  const getPromptTypeFromTab = (tabIndex) => {
    const tabs = [
      '', // All
      'general_chat',
      'business_plan', 
      'code_review',
      'content_strategy',
      'creative_writing'
    ];
    return tabs[tabIndex] || '';
  };

  const getPromptIcon = (promptType) => {
    const icons = {
      business_plan: <Business />,
      code_review: <Code />,
      content_strategy: <Campaign />,
      general_chat: <ChatBubble />,
      learning_path: <School />,
      problem_solving: <Psychology />,
      creative_writing: <Lightbulb />,
      email_writing: <Email />
    };
    return icons[promptType] || <ChatBubble />;
  };

  const getPromptColor = (promptType) => {
    const colors = {
      business_plan: '#4caf50',
      code_review: '#f44336',
      content_strategy: '#ff9800',
      general_chat: '#2196f3',
      learning_path: '#00bcd4',
      problem_solving: '#607d8b',
      creative_writing: '#9c27b0',
      email_writing: '#3f51b5'
    };
    return colors[promptType] || '#2196f3';
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  const formatTimeAgo = (date) => {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  const truncateText = (text, maxLength = 80) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const handleViewGeneration = (generation) => {
    setSelectedGeneration(generation);
    setViewDialogOpen(true);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const filteredGenerations = generations.filter(gen => 
    gen.userInput.toLowerCase().includes(searchTerm.toLowerCase()) ||
    gen.aiResponse.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const promptTypeTabs = [
    { label: 'All', value: '' },
    { label: 'General', value: 'general_chat' },
    { label: 'Business', value: 'business_plan' },
    { label: 'Code', value: 'code_review' },
    { label: 'Content', value: 'content_strategy' },
    { label: 'Creative', value: 'creative_writing' }
  ];

  return (
    <>
      <Dialog 
        open={open} 
        onClose={onClose} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{ sx: { height: '80vh' } }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <History color="primary" />
              <Typography variant="h6">Generation History</Typography>
              {stats && (
                <Chip 
                  icon={<TrendingUp />}
                  label={`${stats.totalGenerations} generations`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </Box>
            <IconButton onClick={onClose} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent dividers sx={{ p: 0 }}>
          {/* Stats Bar */}
          {stats && (
            <Paper sx={{ p: 2, m: 2, bgcolor: 'primary.50', borderRadius: 2 }}>
              <Box display="flex" justifyContent="space-around" alignItems="center">
                <Box textAlign="center">
                  <Typography variant="h6" color="primary.main">
                    {stats.totalGenerations}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total Generations
                  </Typography>
                </Box>
                <Box textAlign="center">
                  <Typography variant="h6" color="primary.main">
                    {stats.totalTokens}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Tokens Used
                  </Typography>
                </Box>
                <Box textAlign="center">
                  <Typography variant="h6" color="primary.main">
                    {Object.keys(stats.byPromptType || {}).length}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Prompt Types
                  </Typography>
                </Box>
              </Box>
            </Paper>
          )}

          {/* Search and Tabs */}
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <TextField
              fullWidth
              placeholder="Search history..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />
            
            <Tabs 
              value={selectedTab} 
              onChange={(e, newValue) => setSelectedTab(newValue)}
              variant="scrollable"
              scrollButtons="auto"
            >
              {promptTypeTabs.map((tab, index) => (
                <Tab 
                  key={tab.value} 
                  label={tab.label}
                  sx={{ minWidth: 'auto', px: 2 }}
                />
              ))}
            </Tabs>
          </Box>

          {/* History List */}
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : filteredGenerations.length === 0 ? (
            <Box textAlign="center" py={4}>
              <History sx={{ fontSize: 48, color: 'grey.300', mb: 2 }} />
              <Typography color="textSecondary" gutterBottom>
                No generation history found
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {searchTerm ? 'Try a different search term' : 'Start chatting to see your history here'}
              </Typography>
            </Box>
          ) : (
            <List sx={{ maxHeight: '50vh', overflow: 'auto' }}>
              {filteredGenerations.map((gen, index) => (
                <React.Fragment key={gen.id}>
                  <ListItem 
                    alignItems="flex-start"
                    sx={{ 
                      '&:hover': { 
                        bgcolor: 'action.hover',
                        borderRadius: 1 
                      } 
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: getPromptColor(gen.promptType) }}>
                        {getPromptIcon(gen.promptType)}
                      </Avatar>
                    </ListItemAvatar>
                    
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                            {gen.promptName || gen.promptType}
                          </Typography>
                          <Chip 
                            label={gen.mode === 'ai' ? 'AI' : 'Mock'} 
                            size="small"
                            color={gen.mode === 'ai' ? 'success' : 'default'}
                            variant="outlined"
                          />
                          {gen.tokensUsed > 0 && (
                            <Chip 
                              label={`${gen.tokensUsed} tokens`}
                              size="small"
                              variant="outlined"
                              color="info"
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="body2" color="text.primary" sx={{ mb: 1 }}>
                            {truncateText(gen.userInput, 120)}
                          </Typography>
                          <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Typography variant="caption" color="text.secondary">
                              {formatTimeAgo(gen.createdAt)} • {formatDate(gen.createdAt)}
                            </Typography>
                            <Box>
                              <Tooltip title="View Details">
                                <IconButton 
                                  onClick={() => handleViewGeneration(gen)} 
                                  size="small"
                                  sx={{ mr: 1 }}
                                >
                                  <Visibility fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Copy Response">
                                <IconButton 
                                  onClick={() => handleCopy(gen.aiResponse)} 
                                  size="small"
                                >
                                  <ContentCopy fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </Box>
                        </>
                      }
                    />
                  </ListItem>
                  {index < filteredGenerations.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
          <Button 
            onClick={loadHistory} 
            color="primary"
            disabled={loading}
          >
            Refresh
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Generation Dialog */}
      <Dialog 
        open={viewDialogOpen} 
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { maxHeight: '80vh' } }}
      >
        {selectedGeneration && (
          <>
            <DialogTitle>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: getPromptColor(selectedGeneration.promptType) }}>
                  {getPromptIcon(selectedGeneration.promptType)}
                </Avatar>
                <Box flex={1}>
                  <Typography variant="h6">
                    {selectedGeneration.promptName || selectedGeneration.promptType}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(selectedGeneration.createdAt)}
                  </Typography>
                </Box>
                <Box display="flex" gap={1}>
                  <Chip 
                    label={selectedGeneration.mode === 'ai' ? 'AI Response' : 'Mock Response'} 
                    size="small"
                    color={selectedGeneration.mode === 'ai' ? 'success' : 'default'}
                  />
                  {selectedGeneration.tokensUsed > 0 && (
                    <Chip 
                      label={`${selectedGeneration.tokensUsed} tokens`}
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>
            </DialogTitle>
            
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box>
                <Typography variant="subtitle2" gutterBottom color="text.secondary">
                  Your Input:
                </Typography>
                <Paper sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {selectedGeneration.userInput}
                  </Typography>
                </Paper>
              </Box>
              
              <Box>
                <Typography variant="subtitle2" gutterBottom color="text.secondary">
                  AI Response:
                </Typography>
                <Paper sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, maxHeight: '300px', overflow: 'auto' }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {selectedGeneration.aiResponse}
                  </Typography>
                </Paper>
              </Box>
            </DialogContent>
            
            <DialogActions>
              <Button 
                startIcon={<ContentCopy />}
                onClick={() => handleCopy(selectedGeneration.aiResponse)}
              >
                Copy Response
              </Button>
              <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
};

export default HistoryPanel;