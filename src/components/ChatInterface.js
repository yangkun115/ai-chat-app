import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Avatar,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const ChatInterface = () => {
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem('chatMessages');
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [currentSpeakingMessage, setCurrentSpeakingMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const speechSynthesis = window.speechSynthesis;

  // 初始化语音识别
  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');
        
        setInput(transcript);
      };

      recognition.onerror = (event) => {
        console.error('语音识别错误:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognition);
    }
  }, []);

  // 监听语音合成状态
  useEffect(() => {
    const handleSpeechEnd = () => {
      setSpeaking(false);
      setCurrentSpeakingMessage(null);
    };

    speechSynthesis.addEventListener('end', handleSpeechEnd);
    return () => {
      speechSynthesis.removeEventListener('end', handleSpeechEnd);
    };
  }, [speechSynthesis]);

  // 保存消息到本地存储
  useEffect(() => {
    localStorage.setItem('chatMessages', JSON.stringify(messages));
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleClearChat = () => {
    setMessages([]);
    handleMenuClose();
  };

  const handleCopyMessage = (content) => {
    navigator.clipboard.writeText(content);
    handleMenuClose();
  };

  const toggleListening = () => {
    if (!recognition) {
      alert('您的浏览器不支持语音识别功能');
      return;
    }

    if (isListening) {
      recognition.stop();
    } else {
      setInput('');
      recognition.start();
      setIsListening(true);
    }
  };

  const handleSpeak = (message) => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      setCurrentSpeakingMessage(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.lang = 'zh-CN';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    setSpeaking(true);
    setCurrentSpeakingMessage(message);
    speechSynthesis.speak(utterance);
  };

  const formatTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { 
      role: 'user', 
      content: input,
      timestamp: formatTime(),
      type: 'text'
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const assistantMessage = { 
      role: 'assistant', 
      content: '',
      timestamp: formatTime(),
      type: 'text'
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer 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',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat-v3-0324:free',
          messages: [...messages, userMessage],
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                const newContent = accumulatedContent + content;
                accumulatedContent = newContent;
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage.role === 'assistant') {
                    lastMessage.content = newContent;
                    // 检测代码块
                    if (newContent.includes('```')) {
                      lastMessage.type = 'code';
                    }
                  }
                  return newMessages;
                });
              }
            } catch (e) {
              console.error('Error parsing JSON:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage.role === 'assistant') {
          lastMessage.content = '抱歉，发生了错误，请稍后重试。';
        }
        return newMessages;
      });
    } finally {
      setLoading(false);
    }
  };

  const renderMessageContent = (message) => {
    if (message.type === 'code') {
      const codeMatch = message.content.match(/```(\w+)?\n([\s\S]*?)```/);
      if (codeMatch) {
        const language = codeMatch[1] || 'javascript';
        const code = codeMatch[2].trim();
        return (
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              borderRadius: '8px',
              fontSize: '0.9rem',
            }}
          >
            {code}
          </SyntaxHighlighter>
        );
      }
    }
    return message.content;
  };

  return (
    <Box sx={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      bgcolor: '#343541',
      color: '#fff',
      position: 'relative',
    }}>
      {/* 顶部标题栏 */}
      <Box sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1,
        bgcolor: '#343541',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        py: 2,
        px: 3,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Typography variant="h6" sx={{ 
          fontWeight: 600,
          background: 'linear-gradient(45deg, #10a37f 30%, #5436DA 90%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          AI 助手
        </Typography>
        <IconButton 
          onClick={handleMenuOpen}
          sx={{ color: '#fff' }}
        >
          <MoreVertIcon />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          PaperProps={{
            sx: {
              bgcolor: '#40414f',
              color: '#fff',
            }
          }}
        >
          <MenuItem onClick={handleClearChat}>
            <DeleteIcon sx={{ mr: 1 }} />
            清空对话
          </MenuItem>
        </Menu>
      </Box>

      {/* 消息列表区域 */}
      <Box sx={{ 
        flex: 1, 
        overflow: 'auto',
        px: { xs: 2, sm: 4, md: 6 },
        py: 4,
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: '#343541',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#565869',
          borderRadius: '4px',
        },
      }}>
        {messages.map((message, index) => (
          <Box
            key={index}
            sx={{
              display: 'flex',
              justifyContent: 'center',
              mb: 2,
              animation: 'fadeIn 0.3s ease-in-out',
              '@keyframes fadeIn': {
                '0%': {
                  opacity: 0,
                  transform: 'translateY(10px)',
                },
                '100%': {
                  opacity: 1,
                  transform: 'translateY(0)',
                },
              },
            }}
          >
            <Box
              sx={{
                maxWidth: '800px',
                width: '100%',
                display: 'flex',
                gap: 2,
                bgcolor: message.role === 'user' ? '#343541' : '#444654',
                py: 3,
                px: { xs: 2, sm: 4 },
                borderRadius: '8px',
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                },
              }}
            >
              <Avatar
                sx={{
                  bgcolor: message.role === 'user' ? '#5436DA' : '#10a37f',
                  width: 36,
                  height: 36,
                }}
              >
                {message.role === 'user' ? <PersonIcon /> : <SmartToyIcon />}
              </Avatar>
              <Box sx={{ 
                flex: 1,
                position: 'relative',
              }}>
                <Box sx={{ 
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  mb: 1,
                }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                    {message.timestamp}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {message.role === 'assistant' && (
                      <Tooltip title={speaking && currentSpeakingMessage === message ? "停止播放" : "播放语音"}>
                        <IconButton
                          size="small"
                          onClick={() => handleSpeak(message)}
                          sx={{ 
                            color: speaking && currentSpeakingMessage === message ? '#10a37f' : 'rgba(255,255,255,0.6)',
                            '&:hover': { color: '#fff' }
                          }}
                        >
                          {speaking && currentSpeakingMessage === message ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="复制消息">
                      <IconButton
                        size="small"
                        onClick={() => handleCopyMessage(message.content)}
                        sx={{ 
                          color: 'rgba(255,255,255,0.6)',
                          '&:hover': { color: '#fff' }
                        }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                <Box sx={{ 
                  '& p': {
                    m: 0,
                    lineHeight: 1.8,
                    fontSize: '1rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }
                }}>
                  {renderMessageContent(message)}
                </Box>
              </Box>
            </Box>
          </Box>
        ))}
        {loading && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            my: 2,
            animation: 'pulse 1.5s infinite',
            '@keyframes pulse': {
              '0%': { opacity: 0.6 },
              '50%': { opacity: 1 },
              '100%': { opacity: 0.6 },
            },
          }}>
            <CircularProgress size={24} sx={{ color: '#10a37f' }} />
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* 输入框区域 */}
      <Box sx={{ 
        borderTop: '1px solid rgba(255,255,255,0.1)',
        p: 2,
        bgcolor: '#343541',
        position: 'sticky',
        bottom: 0,
      }}>
        <Container maxWidth="md">
          <Box sx={{ 
            display: 'flex', 
            gap: 1,
            bgcolor: '#40414f',
            borderRadius: '12px',
            p: 1.5,
            transition: 'all 0.3s ease',
            '&:focus-within': {
              boxShadow: '0 0 0 2px rgba(16, 163, 127, 0.3)',
            },
          }}>
            <TextField
              fullWidth
              variant="standard"
              placeholder="发送消息..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={loading}
              multiline
              maxRows={4}
              sx={{
                '& .MuiInputBase-root': {
                  color: '#fff',
                  fontSize: '1rem',
                },
                '& .MuiInput-underline:before': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:hover:before': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:after': {
                  borderBottom: 'none',
                },
                '& .MuiInputBase-input': {
                  padding: '8px 0',
                },
              }}
            />
            <Tooltip title={isListening ? "停止语音输入" : "开始语音输入"}>
              <IconButton
                onClick={toggleListening}
                sx={{
                  color: isListening ? '#ff4444' : '#fff',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'scale(1.1)',
                  },
                }}
              >
                {isListening ? <MicOffIcon /> : <MicIcon />}
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              sx={{
                minWidth: '40px',
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                bgcolor: '#10a37f',
                transition: 'all 0.3s ease',
                '&:hover': {
                  bgcolor: '#0d8c6d',
                  transform: 'scale(1.05)',
                },
                '&:active': {
                  transform: 'scale(0.95)',
                },
                '&:disabled': {
                  bgcolor: 'rgba(16, 163, 127, 0.5)',
                },
              }}
            >
              <SendIcon />
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
};

export default ChatInterface; 