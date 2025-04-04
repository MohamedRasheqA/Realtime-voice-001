'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import EventLog from './EventLog';
import SessionControls from './SessionControls';
import ToolPanel from './ToolPanel';
import { Settings, Plus, MessageCircle, FileText, Send, Menu, X, Loader, Users, Volume2, VolumeX, Mic, Square, Home } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [isKeyValid, setIsKeyValid] = useState(false);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const [userId] = useState(() => uuidv4());
  const [isTTSEnabled, setIsTTSEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScoreRubricOpen, setIsScoreRubricOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [voiceQueryContext, setVoiceQueryContext] = useState<string>('');
  const [isVoiceQueryLoading, setIsVoiceQueryLoading] = useState(false);

  async function validateApiKey(key: string) {
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });
      
      const isValid = response.ok;
      setIsKeyValid(isValid);
      return isValid;
    } catch (error) {
      console.error("Error validating API key:", error);
      setIsKeyValid(false);
      return false;
    }
  }

  async function startSession() {
    try {
      setIsLoading(true);
      if (!apiKey) {
        alert("Please enter your OpenAI API key");
        setIsLoading(false);
        return;
      }
      
      if (!isKeyValid) {
        const valid = await validateApiKey(apiKey);
        if (!valid) {
          alert("Invalid API key. Please check and try again.");
          setIsLoading(false);
          return;
        }
      }
      
      const EPHEMERAL_KEY = apiKey;
      
      const pc = new RTCPeerConnection();

      audioElement.current = document.createElement("audio");
      audioElement.current.autoplay = true;
      pc.ontrack = (e) => {
        if (audioElement.current) {
          audioElement.current.srcObject = e.streams[0];
        }
      };

      const ms = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      pc.addTrack(ms.getTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      setDataChannel(dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`API request failed: ${errorText}`);
      }

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer as RTCSessionDescriptionInit);

      peerConnection.current = pc;
      setIsLoading(false);
    } catch (error: any) {
      console.error("Error starting session:", error);
      alert(`Failed to start session: ${error.message}`);
      setIsLoading(false);
    }
  }

  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }

    peerConnection.current?.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
    setMessages([]);
  }

  function sendClientEvent(message: any) {
    if (dataChannel && dataChannel.readyState === 'open') {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();

      dataChannel.send(JSON.stringify(message));

      if (!message.timestamp) {
        message.timestamp = timestamp;
      }
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error(
        "Failed to send message - data channel not available or not open",
        message,
        dataChannel ? `Channel state: ${dataChannel.readyState}` : "No channel"
      );
    }
  }
  const systemPrompt = `This Teach-Back is an activity where the user practices a skill they just learned in an online course. Refer to the course storyboard as well as the course assessment to provide you with context. This activity will be scored and should reference only the material in the uploaded documents. You may reference other material in your feedback, but the scoring should be based solely on the course content. This activity is in section 2.5 of course 103. I have outlined how the activity is structured below.

When the user clicks "begin", briefly describe the activity as a teach-back in which they'll receive personalized feedback based on their answer. Also, state the two rubric areas (Comprehensiveness and Clarity & Structure, each accounting for 4 points) and what a passing score is. Then, show the question: "Explain how drug pricing methodologies impact the cost of pharmaceuticals and why this matters in pharmacy benefits consulting." After they submit their answer, grade them based on the rubric below and show them what their score is on each rubric area, as well as what could be done to improve. Continue providing guidance to improve their answer until they get a score of 8/8, then summarize their response into a final statement and congratulate them. Instruct them to proceed in the course.

When a user clicks "instructions", explain in detail how the activity works and highlight that they are aiming for mastery and you will support them in achieving it. Show the full rubric and what their response should include (the 3 bullets below).

The user's response should include:

✔ A clear definition of key drug pricing methodologies, such as AWP, WAC, MAC, and NADAC.

✔ An explanation of how these methodologies influence drug costs and reimbursement structures.

✔ A connection to pharmacy benefits consulting, including how these methodologies affect pricing strategies and cost-containment efforts.

Evaluation Criteria: The user's response will be scored based on the rubric below, with a total of 8 possible points. To pass, they need at least 6 points.

Scoring Rubric (8 Points Total)

Scoring & Feedback Rubric: 4) Excellent 3) Good 2) Fair 1) Poor

Comprehensiveness:

4: Clearly defines drug pricing methodologies, explains their cost impact, and connects them to pharmacy benefits consulting.

3: Mentions drug pricing methodologies and cost impact but lacks full explanation or consulting connection.

2: Provides a vague or incomplete definition of drug pricing methodologies with little explanation of cost impact or relevance to consulting.

1: Response is unclear, incorrect, or missing key details.

Clarity & Structure:

4: Explanation is clear, well-organized, and easy to follow.

3: Mostly clear but could be better structured or more concise.

2: Somewhat unclear or disorganized.

1: Hard to follow or confusing.

✅ Passing Score: 6+ out of 8

Exemplar Response:

Drug pricing methodologies such as AWP, WAC, MAC, and NADAC define how drug costs are determined and reimbursed. AWP is a benchmark for pharmacy pricing, WAC is the manufacturer's list price, MAC caps reimbursement for generics, and NADAC reflects actual pharmacy acquisition costs. These methodologies influence pharmacy pricing, employer drug spend, and PBM negotiations. Understanding them allows pharmacy benefits consultants to optimize cost-containment strategies and ensure fair pricing structures for clients.`;
  async function sendTextMessage(message: string) {
    // Create a clean version for display (without the system prompt)
    const displayMessage = message;
    
    // Check if we should get context from voice-query API
    setIsVoiceQueryLoading(true);
    try {
      const response = await fetch('/api/voice-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: message }],
          userId: userId,
          apiKey: apiKey,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch context');
      }
      
      const data = await response.json();
      if (data.context) {
        setVoiceQueryContext(data.context);
      }
    } catch (error) {
      console.error('Error fetching context:', error);
    } finally {
      setIsVoiceQueryLoading(false);
    }
    
    // Create the full message with system prompt for sending to the API
    const fullMessage = message + " ";
    console.log(voiceQueryContext);
    // If we have context from voice-query, add it to the message
    const contextEnhancedMessage = voiceQueryContext 
      ? `${fullMessage}\n\nRelevant context: ${voiceQueryContext}`
      : fullMessage;
    
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: contextEnhancedMessage,
          },
        ],
      },
    };

    // Add only the display message to the UI
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayMessage
    }]);

    sendClientEvent(event);
    sendClientEvent({ type: "response.create" });
    setInput('');
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || !isSessionActive) return;
    
    sendTextMessage(input.trim());
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (dataChannel) {
      dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        if (!event.timestamp) {
          event.timestamp = new Date().toLocaleTimeString();
        }

        setEvents((prev) => [event, ...prev]);
        
        // Process incoming messages for the chat UI
        if (event.type === "conversation.item.create" && event.item?.role === "assistant") {
          const content = event.item.content.map((c: any) => {
            if (c.type === "text") return c.text;
            return '';
          }).join(' ');
          
          setMessages(prev => [...prev, {
            id: event.event_id || crypto.randomUUID(),
            role: 'assistant',
            content: content
          }]);
        }
      });

      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        setEvents([]);
        
        // Add a welcome message
        setMessages([{
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Welcome to the Realtime Console! I\'m ready to assist you.'
        }]);
      });
    }
  }, [dataChannel]);

  useEffect(() => {
    if (apiKey) {
      validateApiKey(apiKey);
    }
  }, [apiKey]);

  const InstructionsModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    if (!isOpen) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
          <div className="flex justify-between items-center border-b border-gray-200 p-4">
            <h3 className="text-xl font-semibold text-gray-900">Instructions</h3>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 focus:outline-none"
            >
              <X size={24} />
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto">
            <div className="prose max-w-none">
              <h4 className="text-lg font-medium mb-3">About This Console</h4>
              <p>
                This is a realtime console that allows you to interact with Acolyte Health's AI assistant.
              </p>
              
              <h4 className="text-lg font-medium mt-5 mb-3">How to Use</h4>
              <ol className="list-decimal pl-5 my-3">
                <li>Enter your OpenAI API key</li>
                <li>Click "Connect" to validate your key</li>
                <li>Start a session to begin communicating with the model</li>
                <li>Send messages and view the realtime responses</li>
                <li>Use the tools panel to access additional features</li>
              </ol>
              
              <h4 className="text-lg font-medium mt-5 mb-3">Tips</h4>
              <ul className="list-disc pl-5 my-3">
                <li>Your API key is never stored permanently</li>
                <li>The event log shows all communication with the API</li>
                <li>You can stop the session at any time</li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-200 p-4 flex justify-end">
            <button
              onClick={onClose}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-md hover:from-indigo-700 hover:to-purple-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const VoiceRecorder = ({ onTranscription, disabled, systemPrompt }: { onTranscription: (text: string) => void, disabled?: boolean, systemPrompt: string }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingError, setRecordingError] = useState<string | null>(null);
    
    const startRecording = async () => {
      setIsRecording(true);
      setRecordingError(null);
      
      try {
        // Here you would implement actual voice recording and transcription
        // For now, we'll simulate it with a timeout
        setTimeout(() => {
          const simulatedTranscription = "This is a simulated voice transcription";
          onTranscription(simulatedTranscription);
          setIsRecording(false);
        }, 2000);
        
        // In a real implementation, you would:
        // 1. Record audio using MediaRecorder API
        // 2. Send the audio to a transcription service
        // 3. Get the transcription and call onTranscription with the result
      } catch (error) {
        console.error('Error recording voice:', error);
        setRecordingError('Failed to record audio');
        setIsRecording(false);
      }
    };
    
    const stopRecording = () => {
      setIsRecording(false);
      // In a real implementation, you would stop the MediaRecorder here
    };
    
    return (
      <div>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled || !isSessionActive}
          className={`p-2 rounded-full transition-all duration-200 ${
            isRecording ? 'bg-red-500 text-white' : 'bg-gray-100'
          } hover:bg-opacity-90 disabled:opacity-50`}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
          type="button"
        >
          {isRecording ? (
            <Square className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4 text-gray-600" />
          )}
        </button>
        {recordingError && <div className="text-red-500 text-xs mt-1">{recordingError}</div>}
      </div>
    );
  };

  return (
    <>
      <motion.nav 
        className="absolute top-0 left-0 right-0 h-16 flex items-center bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-4 w-full m-4 pb-2">
          <motion.div
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white text-indigo-600 font-bold"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ duration: 0.3 }}
          >
            AH
          </motion.div>
          <motion.h1
            className="text-xl font-bold"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            Acolyte Health Realtime Assistant
          </motion.h1>
          <motion.div 
            className="ml-auto text-sm bg-white/20 px-3 py-1 rounded-full"
            whileHover={{ backgroundColor: "rgba(255,255,255,0.3)" }}
          >
            v1.0
          </motion.div>
        </div>
      </motion.nav>
      
      <InstructionsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      
      <main className="absolute top-16 left-0 right-0 bottom-0 bg-gray-50">
        <section className="absolute top-0 left-0 right-[380px] bottom-0 flex">
          <section className="absolute top-0 left-0 right-0 bottom-32 px-4 overflow-y-auto">
            {!apiKey ? (
              <motion.div 
                className="flex flex-col items-center justify-center h-full"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <motion.div 
                  className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md"
                  whileHover={{ boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)" }}
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="relative"
                  >
                    <div className="relative rounded-md">
                      <input
                        type="password"
                        className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center text-lg"
                        placeholder="Enter API Key"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                      />
                    </div>
                  </motion.div>
                  <motion.button
                    className="w-full mt-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-3 rounded-md hover:from-indigo-700 hover:to-purple-700 transition-all font-medium"
                    onClick={() => validateApiKey(apiKey)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    Connect
                  </motion.button>
                </motion.div>
              </motion.div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto py-4">
                  <div className="space-y-4">
                    {messages.map((m) => (
                      <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {m.role === 'assistant' && (
                          <div className="mr-2 flex items-start pt-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                              AI
                            </div>
                          </div>
                        )}
                        <div
                          className={`max-w-[75%] p-4 rounded-lg shadow-sm ${
                            m.role === 'user'
                              ? 'bg-indigo-100 text-gray-900'
                              : 'bg-white border border-gray-200'
                          }`}
                        >
                          <div className="prose max-w-none">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="mr-2 flex items-start pt-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                            AI
                          </div>
                        </div>
                        <div className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
                
                {!isSessionActive && isKeyValid && (
                  <motion.div 
                    className="flex flex-col items-center justify-center py-8 px-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6 }}
                  >
                    <motion.h2 
                      className="text-3xl font-bold text-gray-800 mb-4 text-center bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600"
                      initial={{ y: -20 }}
                      animate={{ y: 0 }}
                      transition={{ duration: 0.5 }}
                    >
                      Acolyte Health Realtime Experience
                    </motion.h2>
                    
                    <motion.div
                      className="relative mb-8"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2, duration: 0.5 }}
                    >
                      <div className="w-64 h-64 sm:w-80 sm:h-80 relative">
                        <motion.div 
                          className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-full"
                          animate={{ 
                            scale: [1, 1.05, 1],
                            opacity: [0.7, 0.9, 0.7]
                          }}
                          transition={{ 
                            duration: 3,
                            repeat: Infinity,
                            repeatType: "reverse"
                          }}
                        />
                        <motion.div
                          className="absolute inset-0 flex items-center justify-center"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        >
                          {[...Array(8)].map((_, i) => (
                            <motion.div
                              key={i}
                              className="absolute w-3 h-3 bg-indigo-600 rounded-full"
                              style={{
                                top: `${50 + 40 * Math.sin(i * (Math.PI / 4))}%`,
                                left: `${50 + 40 * Math.cos(i * (Math.PI / 4))}%`,
                              }}
                              animate={{ 
                                scale: [1, 1.5, 1],
                                opacity: [0.7, 1, 0.7]
                              }}
                              transition={{ 
                                duration: 2,
                                delay: i * 0.2,
                                repeat: Infinity,
                                repeatType: "reverse"
                              }}
                            />
                          ))}
                        </motion.div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <motion.div
                            className="w-48 h-48 sm:w-56 sm:h-56 bg-white rounded-full shadow-xl flex items-center justify-center"
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.4, duration: 0.5 }}
                          >
                            <motion.div
                              className="flex flex-col items-center justify-center"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.6, duration: 0.5 }}
                            >
                              <span className="text-2xl sm:text-3xl font-bold text-indigo-600 tracking-tight">ACOLYTE</span>
                              <span className="text-xl sm:text-2xl font-bold text-purple-600 tracking-tight">HEALTH</span>
                            </motion.div>
                          </motion.div>
                        </div>
                      </div>
                    </motion.div>
                    
                    <motion.button
                      className="relative bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-lg font-medium text-lg shadow-lg"
                      onClick={startSession}
                      disabled={isLoading}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.5, duration: 0.5 }}
                    >
                      {isLoading ? (
                        <div className="flex items-center space-x-2">
                          <Loader className="w-5 h-5 animate-spin" />
                          <span>Connecting...</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <Plus size={20} />
                          <span>Start Session</span>
                        </div>
                      )}
                    </motion.button>
                  </motion.div>
                )}
              </div>
            )}
          </section>
          
          <motion.section 
            className="absolute h-32 left-0 right-0 bottom-0 p-4 bg-white border-t border-gray-200"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {isSessionActive ? (
              <form ref={formRef} onSubmit={handleSubmit} className="flex space-x-2 h-full items-center">
                <textarea
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                  placeholder="Type your message here..."
                  className="flex-1 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                  rows={2}
                />
                <div className="flex flex-col space-y-2">
                  {isVoiceQueryLoading && (
                    <div className="absolute right-16 bottom-16 bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs">
                      Fetching context...
                    </div>
                  )}
                  <VoiceRecorder 
                    onTranscription={(text) => setInput(text)} 
                    disabled={!isSessionActive} 
                    systemPrompt={systemPrompt}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || !isSessionActive || isVoiceQueryLoading}
                    className="p-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-md hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            ) : (
              <SessionControls
                startSession={startSession}
                stopSession={stopSession}
                sendClientEvent={sendClientEvent}
                sendTextMessage={sendTextMessage}
                events={events}
                isSessionActive={isSessionActive}
                apiKey={apiKey}
                setApiKey={setApiKey}
                isKeyValid={isKeyValid}
              />
            )}
          </motion.section>
        </section>
        
        <motion.section 
          className="absolute top-0 w-[380px] right-0 bottom-0 p-4 pt-0 overflow-y-auto bg-white border-l border-gray-200"
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <motion.div 
            className="sticky top-0 pt-4 pb-2 bg-white z-10 border-b border-gray-200 mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-800">Event Log</h2>
              <div className="flex space-x-2">
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="p-2 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  title="Instructions"
                >
                  <Settings size={18} />
                </button>
                {isSessionActive && (
                  <button 
                    onClick={stopSession}
                    className="p-2 bg-red-100 text-red-600 rounded-md hover:bg-red-200 transition-colors"
                    title="Stop Session"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
          
          <EventLog events={events} />
          
          {isSessionActive && (
            <ToolPanel
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          )}
        </motion.section>
      </main>
    </>
  );
}