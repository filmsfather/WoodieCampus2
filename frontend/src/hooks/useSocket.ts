import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface UseSocketOptions {
  autoConnect?: boolean;
  userId?: string;
  userRole?: string;
}

export interface SocketStats {
  connected: boolean;
  authenticated: boolean;
  userId?: string;
  userRole?: string;
  connectionId?: string;
}

export const useSocket = (options: UseSocketOptions = {}) => {
  const { autoConnect = true, userId, userRole } = options;
  const socketRef = useRef<Socket | null>(null);
  
  const [stats, setStats] = useState<SocketStats>({
    connected: false,
    authenticated: false,
  });

  const [messages, setMessages] = useState<any[]>([]);

  // Connect to socket server
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    
    socketRef.current = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      setStats(prev => ({
        ...prev,
        connected: true,
        connectionId: socket.id,
      }));

      // Auto-authenticate if userId is provided
      if (userId) {
        authenticate(userId, userRole);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setStats(prev => ({
        ...prev,
        connected: false,
        authenticated: false,
        connectionId: undefined,
      }));
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    // Authentication events
    socket.on('authenticated', (data) => {
      console.log('Authentication response:', data);
      if (data.success) {
        setStats(prev => ({
          ...prev,
          authenticated: true,
          userId: data.userId,
          userRole: data.userRole,
        }));
      } else {
        console.error('Authentication failed:', data.error);
      }
    });

    // Message events
    socket.on('new-message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.on('user-joined', (data) => {
      console.log('User joined:', data);
    });

    socket.on('user-left', (data) => {
      console.log('User left:', data);
    });

    socket.on('user-typing', (data) => {
      console.log('User typing:', data);
    });

    socket.connect();
  }, [userId, userRole]);

  // Disconnect from socket server
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  // Authenticate user
  const authenticate = useCallback((userId: string, userRole: string = 'student') => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('authenticate', {
        userId,
        userRole,
        token: 'dummy-token', // In real app, use actual JWT token
      });
    }
  }, []);

  // Join a room
  const joinRoom = useCallback((roomId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-room', roomId);
    }
  }, []);

  // Leave a room
  const leaveRoom = useCallback((roomId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave-room', roomId);
    }
  }, []);

  // Send message to room
  const sendMessage = useCallback((roomId: string, message: string, type: string = 'text') => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('send-message', {
        roomId,
        message,
        type,
      });
    }
  }, []);

  // Send typing indicator
  const sendTyping = useCallback((roomId: string, isTyping: boolean) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing', {
        roomId,
        isTyping,
      });
    }
  }, []);

  // Update course progress
  const updateProgress = useCallback((courseId: string, progress: number, lessonId?: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('progress-update', {
        courseId,
        progress,
        lessonId,
      });
    }
  }, []);

  // Join live session
  const joinLiveSession = useCallback((sessionId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-live-session', sessionId);
    }
  }, []);

  // Listen to custom events
  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  }, []);

  // Remove event listener
  const off = useCallback((event: string, callback?: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  }, []);

  // Emit custom event
  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    // Connection state
    stats,
    messages,
    
    // Connection methods
    connect,
    disconnect,
    authenticate,
    
    // Room methods
    joinRoom,
    leaveRoom,
    
    // Messaging methods
    sendMessage,
    sendTyping,
    
    // Educational features
    updateProgress,
    joinLiveSession,
    
    // Generic socket methods
    on,
    off,
    emit,
    
    // Direct socket access (use carefully)
    socket: socketRef.current,
  };
};