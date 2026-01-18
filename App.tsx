import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameBoard } from './components/GameBoard';
import { BoardState, Player, GameMode, GameType, BoardSize, Difficulty } from './types';
import { createBoard, attemptMove, getAIMove, checkGomokuWin, calculateScore, calculateWinRate, serializeGame, deserializeGame } from './utils/goLogic';
import { RotateCcw, Users, Cpu, Trophy, Settings, SkipForward, Play, Frown, Globe, Copy, Check, Wind, Volume2, VolumeX, BarChart3, Skull, Undo2, AlertCircle, X, Eye, FileUp, Hash, Eraser, PenTool, LayoutGrid, Zap } from 'lucide-react';

// --- 1. 引入 Supabase ---
import { createClient } from '@supabase/supabase-js';

// --- 2. 配置 Supabase (使用你提供的信息) ---
const SUPABASE_URL = 'https://ibtgczhypjybiibtapcn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlidGdjemh5cGp5YmlpYnRhcGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NTExMDIsImV4cCI6MjA4NDIyNzEwMn0.duXCEXmxLSppLlw0q-9JoFD7EpIBUw6fc1zmDiRwTPU'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 3. 定义信令消息类型 ---
type SignalMessage = 
  | { type: 'join' } 
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

// 原有的 Worker URL 可以保留用于获取额外 TURN (可选)，或者直接删掉
const WORKER_URL = 'https://api.yesterhaze.codes';

// ... (这里保留你的 HistoryItem, PeerMessage 类型定义，AppMode 等，不用变) ...
interface HistoryItem {
    board: BoardState;
    currentPlayer: Player;
    blackCaptures: number;
    whiteCaptures: number;
    lastMove: { x: number, y: number } | null;
    consecutivePasses: number;
}
type AppMode = 'playing' | 'review' | 'setup';

const App: React.FC = () => {
  // ... (保留原本的 state: boardSize, gameType 等等，直到 "Online State") ...
  
  // --- Global App State ---
  const [boardSize, setBoardSize] = useState<BoardSize>(9);
  const [gameType, setGameType] = useState<GameType>('Go');
  const [gameMode, setGameMode] = useState<GameMode>('PvP');
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  
  // Visual/Audio Settings
  const [showQi, setShowQi] = useState<boolean>(false);
  const [showWinRate, setShowWinRate] = useState<boolean>(true);
  const [showCoordinates, setShowCoordinates] = useState<boolean>(false);
  const [musicVolume, setMusicVolume] = useState<number>(0.3);

  // Settings Modal Local State
  const [tempBoardSize, setTempBoardSize] = useState<BoardSize>(9);
  const [tempGameType, setTempGameType] = useState<GameType>('Go');
  const [tempGameMode, setTempGameMode] = useState<GameMode>('PvP');
  const [tempDifficulty, setTempDifficulty] = useState<Difficulty>('Medium');

  // Game State
  const [board, setBoard] = useState<BoardState>(createBoard(9));
  const [currentPlayer, setCurrentPlayer] = useState<Player>('black');
  const [blackCaptures, setBlackCaptures] = useState(0);
  const [whiteCaptures, setWhiteCaptures] = useState(0);
  const [lastMove, setLastMove] = useState<{ x: number; y: number } | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [winReason, setWinReason] = useState<string>('');
  const [consecutivePasses, setConsecutivePasses] = useState(0);
  const [passNotificationDismissed, setPassNotificationDismissed] = useState(false); 
  const [finalScore, setFinalScore] = useState<{black: number, white: number} | null>(null);
  
  // App Modes
  const [appMode, setAppMode] = useState<AppMode>('playing');
  const [reviewIndex, setReviewIndex] = useState(0); 
  const [setupTool, setSetupTool] = useState<'black' | 'white' | 'erase'>('black'); 

  // Import/Export
  const [showImportModal, setShowImportModal] = useState(false);
  const [importKey, setImportKey] = useState('');
  
  // Undo Stack
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // UI State
  const [showMenu, setShowMenu] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false); 
  const [isThinking, setIsThinking] = useState(false); 

  // --- Online State (移除了 pollingRef) ---
  const [showOnlineMenu, setShowOnlineMenu] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [myColor, setMyColor] = useState<Player | null>(null);
  const [copied, setCopied] = useState(false);
  const [gameCopied, setGameCopied] = useState(false);

  // WebRTC Refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null); // 新增：用于清理 Supabase 频道

  // Audio Refs ... (保留原样)
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const sfxMove = useRef<HTMLAudioElement | null>(null);
  const sfxCapture = useRef<HTMLAudioElement | null>(null);
  const sfxError = useRef<HTMLAudioElement | null>(null);
  const sfxWin = useRef<HTMLAudioElement | null>(null);
  const sfxLose = useRef<HTMLAudioElement | null>(null);

  const [hasInteracted, setHasInteracted] = useState(false);

  // Refs for State ... (保留原样)
  const boardRef = useRef(board);
  const currentPlayerRef = useRef(currentPlayer);
  const gameTypeRef = useRef(gameType);
  const myColorRef = useRef(myColor);
  const onlineStatusRef = useRef(onlineStatus);

  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { currentPlayerRef.current = currentPlayer; }, [currentPlayer]);
  useEffect(() => { gameTypeRef.current = gameType; }, [gameType]);
  useEffect(() => { myColorRef.current = myColor; }, [myColor]);
  useEffect(() => { onlineStatusRef.current = onlineStatus; }, [onlineStatus]);

  // Handle Audio Initialization ... (保留原样)
  useEffect(() => {
     sfxMove.current = new Audio('/move.mp3');
     sfxCapture.current = new Audio('/capture.mp3');
     sfxError.current = new Audio('/error.mp3');
     sfxWin.current = new Audio('/win.mp3');
     sfxLose.current = new Audio('/lose.mp3');
  }, []);

  const playSfx = (type: 'move' | 'capture' | 'error' | 'win' | 'lose') => {
      // ... (保留原样)
      if (musicVolume === 0) return; 
      const play = (ref: React.MutableRefObject<HTMLAudioElement | null>) => {
          if (ref.current) {
              ref.current.currentTime = 0;
              ref.current.volume = Math.min(1, musicVolume + 0.2); 
              ref.current.play().catch(() => {});
          }
      };
      switch(type) {
          case 'move': play(sfxMove); break;
          case 'capture': play(sfxCapture); break;
          case 'error': play(sfxError); break;
          case 'win': play(sfxWin); break;
          case 'lose': play(sfxLose); break;
      }
  };

  // ... (保留 Audio useEffects, Settings sync, applySettingsAndRestart) ...
  useEffect(() => {
    const startAudio = () => { if (!hasInteracted) { setHasInteracted(true); if (bgmRef.current && musicVolume > 0 && bgmRef.current.paused) { bgmRef.current.play().catch(e => console.log('Autoplay deferred:', e)); } } };
    document.addEventListener('click', startAudio);
    return () => document.removeEventListener('click', startAudio);
  }, [hasInteracted, musicVolume]);

  useEffect(() => { if (bgmRef.current) { bgmRef.current.volume = musicVolume; if (musicVolume > 0 && bgmRef.current.paused && hasInteracted) { bgmRef.current.play().catch(e => console.log("Play blocked", e)); } else if (musicVolume === 0) { bgmRef.current.pause(); } } }, [musicVolume, hasInteracted]);

  useEffect(() => { if (showMenu) { setTempBoardSize(boardSize); setTempGameType(gameType); setTempDifficulty(difficulty); setTempGameMode(gameMode); } }, [showMenu, boardSize, gameType, difficulty, gameMode]);

  const applySettingsAndRestart = () => {
      // ... (保留原样，但在最后加入 cleanupOnline 逻辑)
      setBoardSize(tempBoardSize); setGameType(tempGameType); setDifficulty(tempDifficulty); setGameMode(tempGameMode);
      setBoard(createBoard(tempBoardSize)); setCurrentPlayer('black'); setBlackCaptures(0); setWhiteCaptures(0); setLastMove(null); setGameOver(false); setWinner(null); setWinReason(''); setConsecutivePasses(0); setPassNotificationDismissed(false); setFinalScore(null); setHistory([]); setShowMenu(false); setShowPassModal(false); setIsThinking(false); setAppMode('playing');
      
      cleanupOnline(); // 清理在线状态
  };

  // --- Helper: Board Stringify for Ko ---
  const getBoardHash = (b: BoardState) => {
      let str = '';
      for(let r=0; r<b.length; r++) for(let c=0; c<b.length; c++) str += b[r][c] ? (b[r][c]?.color==='black'?'B':'W') : '.';
      return str;
  };

  // ----------------------------------------------------------------
  // --- 核心网络逻辑重构开始 ---
  // ----------------------------------------------------------------

  // 1. 获取 ICE 服务器 (加入国内优化)
  const getIceServers = async () => {
    // 国内极速 STUN
    const publicStunServers = [
        "stun:stun.qq.com:3478",
        "stun:stun.miwifi.com:3478",
        "stun:stun.chat.bilibili.com:3478"
    ];

    let turnServers = [];
    // 尝试获取 TURN 作为备用 (可选)
    try {
        const res = await fetch(`${WORKER_URL}/ice-servers`, { method: 'POST' });
        const data = await res.json();
        if (data && data.iceServers) turnServers = data.iceServers;
    } catch (e) {
        console.log("TURN 获取失败，仅使用 STUN");
    }

    return [
        { urls: publicStunServers }, 
        ...turnServers
    ];
  };

  // 2. 发送信号到 Supabase 频道
  const sendSignal = async (roomId: string, payload: SignalMessage) => {
    console.log(`[发送信号] -> 类型: ${payload.type}`, payload);
    try {
        await supabase.channel(`room_${roomId}`).send({
            type: 'broadcast',
            event: 'signal',
            payload
        });
    } catch (error) {
        console.error("信号发送失败:", error);
    }
  };

  // 找到原本的 setupPeerConnection，替换为：
    const setupPeerConnection = async (roomId: string, isHost: boolean) => {
        console.log(`%c[WebRTC] 初始化 PeerConnection (Host: ${isHost})`, 'color: #00ff00; font-weight: bold;');
        
        if (pcRef.current) {
            console.log(`[WebRTC] 清理旧连接...`);
            pcRef.current.close();
        }

        const iceServers = await getIceServers();
        console.log(`[WebRTC] 使用 ICE Servers:`, iceServers);

        const pc = new RTCPeerConnection({
            iceServers,
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle'
        });
        pcRef.current = pc;

        // --- 调试：监听连接状态变化 ---
        pc.onconnectionstatechange = () => {
            console.log(`%c[WebRTC] 🔄 Connection State: ${pc.connectionState}`, 'color: orange');
            if (pc.connectionState === 'failed') {
                console.error('[WebRTC] 连接失败，请检查防火墙或 STUN/TURN 服务器');
            }
        };

        pc.onsignalingstatechange = () => {
            console.log(`[WebRTC] 🚦 Signaling State: ${pc.signalingState}`);
        };

        pc.oniceconnectionstatechange = () => {
            console.log(`[WebRTC] 🧊 ICE Connection State: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'connected') {
                console.log(`%c[WebRTC] ✅ P2P 连接建立成功!`, 'color: #00ff00; font-weight: bold; font-size: 14px;');
                setOnlineStatus('connected');
            } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                setOnlineStatus('disconnected');
                console.warn("[WebRTC] ICE 连接断开/失败");
            }
        };

        // --- 调试：打印具体的 ICE 候选 ---
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`[WebRTC] 🧊 收集到 ICE 候选: ${event.candidate.type} - ${event.candidate.protocol} ${event.candidate.address}:${event.candidate.port}`);
                sendSignal(roomId, { type: 'ice', candidate: event.candidate.toJSON() });
            } else {
                console.log(`[WebRTC] 🧊 ICE 候选收集完成 (End of Candidates)`);
            }
        };

        if (isHost) {
            console.log("[WebRTC] (Host) 创建 DataChannel 'game-channel'...");
            const dc = pc.createDataChannel("game-channel");
            setupDataChannel(dc, true);
        } else {
            pc.ondatachannel = (event) => {
                console.log(`[WebRTC] (Guest) 收到 DataChannel: ${event.channel.label}`);
                setupDataChannel(event.channel, false);
            };
        }

        return pc;
    };
  // 4. 数据通道逻辑 (处理游戏消息)
    const setupDataChannel = (dc: RTCDataChannel, isHost: boolean) => {
        dataChannelRef.current = dc;
        
        dc.onopen = () => {
            console.log(`%c[DataChannel] ✅ 通道已打开 (ReadyState: ${dc.readyState})`, 'color: cyan; font-weight: bold;');
            setOnlineStatus('connected');
            setShowOnlineMenu(false);
            setShowMenu(false);
            setGameMode('PvP');
            
            if (isHost) {
                console.log(`[DataChannel] Host 发送 SYNC 初始状态...`);
                setMyColor('black');
                resetGame(true);
                if (dc.readyState === 'open') {
                    dc.send(JSON.stringify({ 
                        type: 'SYNC', 
                        boardSize: boardSize, 
                        gameType: gameTypeRef.current, 
                        startColor: 'white' 
                    }));
                }
            }
        };

        dc.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            console.log(`[DataChannel] 📩 收到消息:`, msg.type, msg); // 调试输出收到的指令
            
            if (msg.type === 'MOVE') executeMove(msg.x, msg.y, true);
            else if (msg.type === 'PASS') handlePass(true);
            else if (msg.type === 'SYNC') { 
                console.log(`[DataChannel] 执行 SYNC 同步`);
                setBoardSize(msg.boardSize); 
                setGameType(msg.gameType); 
                setMyColor(msg.startColor); 
                resetGame(true); 
            }
            else if (msg.type === 'RESTART') {
                console.log(`[DataChannel] 对手请求重置`);
                resetGame(true);
            }
        };

        dc.onerror = (error) => {
            console.error(`[DataChannel] ❌ 发生错误:`, error);
        };

        dc.onclose = () => { 
            console.log("[DataChannel] ⚠️ 通道关闭");
            setOnlineStatus('disconnected'); 
            setMyColor(null); 
        };
    };

  // 清理函数
  const cleanupOnline = () => {
      if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
      }
      if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
      }
      setOnlineStatus('disconnected');
  };

  useEffect(() => {
      return () => cleanupOnline();
  }, []);

  // --- 创建房间 (Host) ---
  const createRoom = async () => {
      cleanupOnline(); // 先清理

      const id = Math.floor(100000 + Math.random() * 900000).toString();
      setPeerId(id);
      setOnlineStatus('connecting');
      console.log(`[Supabase] 正在创建房间 ${id}，订阅频道...`);

      const channel = supabase.channel(`room_${id}`);
      channelRef.current = channel;

      channel
        .on('broadcast', { event: 'signal' }, async ({ payload }: { payload: SignalMessage }) => {
            const pc = pcRef.current;
            console.log(`[Supabase] 收到信号: ${payload.type}`);

            if (payload.type === 'join') {
                // 客人加入了 -> 创建 Offer
                console.log("[流程] 客人加入，开始创建 Offer...");
                const newPc = await setupPeerConnection(id, true);
                const offer = await newPc.createOffer();
                await newPc.setLocalDescription(offer);
                await sendSignal(id, { type: 'offer', sdp: newPc.localDescription! });
            }
            else if (payload.type === 'answer' && payload.sdp && pc) {
                console.log("[流程] 收到 Answer，设置远程描述...");
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            }
            else if (payload.type === 'ice' && payload.candidate && pc) {
                console.log("[流程] 添加对方 ICE 候选...");
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            }
        })
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log(`%c[Supabase] ✅ 成功订阅频道 room_${id}，等待客人...`, 'color: yellow');
            } else {
                console.error(`[Supabase] ❌ 订阅状态: ${status}`, err);
            }
        });
  };

  // --- 加入房间 (Guest) ---
  const joinRoom = async () => {
      if (!remotePeerId) return;
      cleanupOnline(); // 先清理

      setOnlineStatus('connecting');
      console.log(`[Supabase] 正在加入房间 ${remotePeerId}...`);

      const channel = supabase.channel(`room_${remotePeerId}`);
      channelRef.current = channel;

      channel
        .on('broadcast', { event: 'signal' }, async ({ payload }: { payload: SignalMessage }) => {
            console.log(`[Supabase] 收到信号: ${payload.type}`);
            let pc = pcRef.current;

            if (payload.type === 'offer' && payload.sdp) {
                console.log("[流程] 收到 Offer，开始创建 Answer...");
                if (!pc) pc = await setupPeerConnection(remotePeerId, false);
                
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                await sendSignal(remotePeerId, { type: 'answer', sdp: pc.localDescription! });
            }
            else if (payload.type === 'ice' && payload.candidate) {
                // 如果收到 ICE 时 PC 还没好，可能需要暂存，但 Supabase 速度通常够快
                if (pc) {
                    console.log("[流程] 添加对方 ICE 候选...");
                    await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
                }
            }
        })
        .subscribe(async (status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log(`%c[Supabase] ✅ 成功订阅频道 room_${remotePeerId}，发送 JOIN 信号...`, 'color: yellow');
                await setupPeerConnection(remotePeerId, false);
                await sendSignal(remotePeerId, { type: 'join' });
            } else {
                console.error(`[Supabase] ❌ 订阅状态: ${status}`, err);
            }
        });
  };
    useEffect(() => {
        // 当联机菜单打开(showOnlineMenu)，且没有房间号(peerId)，且状态是断开时
        // 自动触发创建房间
        if (showOnlineMenu && !peerId && onlineStatus === 'disconnected') {
            createRoom();
        }
    }, [showOnlineMenu, peerId, onlineStatus]);
  // ----------------------------------------------------------------
  // --- 网络逻辑重构结束 ---
  // ----------------------------------------------------------------

  const resetGame = (keepOnline: boolean = false) => {
    setBoard(createBoard(boardSize)); setCurrentPlayer('black'); setBlackCaptures(0); setWhiteCaptures(0); setLastMove(null); setGameOver(false); setWinner(null); setWinReason(''); setConsecutivePasses(0); setPassNotificationDismissed(false); setFinalScore(null); setHistory([]); setShowMenu(false); setShowPassModal(false); setIsThinking(false); setAppMode('playing');
    
    // 如果是本地重置，发个消息给对面
    if (onlineStatusRef.current === 'connected' && !keepOnline) {
        if (dataChannelRef.current?.readyState === 'open') {
             dataChannelRef.current.send(JSON.stringify({ type: 'RESTART' }));
        }
    }
    
    if (!keepOnline) { 
        cleanupOnline();
        setMyColor(null);
    }
  };

  const sendData = (msg: any) => { if (dataChannelRef.current?.readyState === 'open') dataChannelRef.current.send(JSON.stringify(msg)); };
  
  const copyId = () => { navigator.clipboard.writeText(peerId); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const copyGameState = () => { const stateStr = serializeGame(board, currentPlayer, gameType, blackCaptures, whiteCaptures); navigator.clipboard.writeText(stateStr); setGameCopied(true); setTimeout(() => setGameCopied(false), 2000); };

  const handleImportGame = () => {
      const gameState = deserializeGame(importKey);
      if (gameState) {
          setBoard(gameState.board); setCurrentPlayer(gameState.currentPlayer); setGameType(gameState.gameType); setBoardSize(gameState.boardSize); setBlackCaptures(gameState.blackCaptures); setWhiteCaptures(gameState.whiteCaptures);
          setHistory([]); setGameOver(false); setWinner(null); setConsecutivePasses(0); setAppMode('playing'); setShowImportModal(false); setShowMenu(false); playSfx('move');
      } else { alert('无效的棋局密钥'); }
  };
  
  // ... (保留 handleUndo, executeMove, handleIntersectionClick, handlePass, endGame 等逻辑) ...
  // 注意：executeMove 里调用的 sendData 逻辑已经适配了上面的修改
  const handleUndo = () => {
      if (history.length === 0 || isThinking || gameOver || onlineStatus === 'connected') return;
      let stepsToUndo = 1;
      if (gameMode === 'PvAI' && currentPlayer === 'black' && history.length >= 2) stepsToUndo = 2;
      const prev = history[history.length - stepsToUndo];
      setBoard(prev.board); setCurrentPlayer(prev.currentPlayer); setBlackCaptures(prev.blackCaptures); setWhiteCaptures(prev.whiteCaptures); setLastMove(prev.lastMove); setConsecutivePasses(prev.consecutivePasses); setPassNotificationDismissed(false); 
      setHistory(prevHistory => prevHistory.slice(0, prevHistory.length - stepsToUndo));
  };

  const executeMove = (x: number, y: number, isRemote: boolean) => {
      const currentBoard = boardRef.current; const activePlayer = currentPlayerRef.current; const currentType = gameTypeRef.current;
      let prevHash = null;
      if (history.length > 0) prevHash = getBoardHash(history[history.length - 1].board);
      const result = attemptMove(currentBoard, x, y, activePlayer, currentType, prevHash);
      if (result) {
          if (result.captured > 0) playSfx('capture'); else playSfx('move');
          if (!isRemote) setHistory(prev => [...prev, { board: currentBoard, currentPlayer: activePlayer, blackCaptures, whiteCaptures, lastMove, consecutivePasses }]);
          setBoard(result.newBoard); setLastMove({ x, y }); setConsecutivePasses(0); setPassNotificationDismissed(false); 
          if (result.captured > 0) { if (activePlayer === 'black') setBlackCaptures(prev => prev + result.captured); else setWhiteCaptures(prev => prev + result.captured); }
          if (currentType === 'Gomoku' && checkGomokuWin(result.newBoard, {x, y})) { setTimeout(() => endGame(activePlayer, '五子连珠！'), 0); return; }
          setCurrentPlayer(prev => prev === 'black' ? 'white' : 'black');
      } else { if (!isRemote) playSfx('error'); }
  };

  const handleIntersectionClick = useCallback((x: number, y: number) => {
    if (appMode === 'review') return; 
    if (appMode === 'setup') {
        const newBoard = board.map(row => row.map(s => s));
        if (setupTool === 'erase') { if (newBoard[y][x]) { newBoard[y][x] = null; playSfx('capture'); } } 
        else { newBoard[y][x] = { color: setupTool, x, y, id: `setup-${setupTool}-${Date.now()}` }; playSfx('move'); }
        setBoard(newBoard); return;
    }
    if (gameOver || isThinking) return;
    if (gameMode === 'PvAI' && currentPlayer === 'white') return;
    // 在线逻辑
    if (onlineStatus === 'connected') { 
        if (currentPlayer !== myColor) return; // 不是我的回合
        sendData({ type: 'MOVE', x, y }); 
    }
    executeMove(x, y, false);
  }, [gameOver, gameMode, currentPlayer, onlineStatus, myColor, isThinking, appMode, setupTool, board]);

  const handlePass = useCallback((isRemote: boolean = false) => {
    if (gameOver) return;
    if (!isRemote) setHistory(prev => [...prev, { board: boardRef.current, currentPlayer: currentPlayerRef.current, blackCaptures, whiteCaptures, lastMove, consecutivePasses }]);
    if (onlineStatusRef.current === 'connected' && !isRemote) { if (currentPlayerRef.current !== myColorRef.current) return; sendData({ type: 'PASS' }); }
    setConsecutivePasses(prev => {
        const newPasses = prev + 1;
        if (newPasses >= 2) { setTimeout(() => { const score = calculateScore(boardRef.current); setFinalScore(score); setShowPassModal(false); if (score.black > score.white) endGame('black', `比分: 黑 ${score.black} - 白 ${score.white}`); else endGame('white', `比分: 白 ${score.white} - 黑 ${score.black}`); }, 0); }
        return newPasses;
    });
    setPassNotificationDismissed(false); 
    if (consecutivePasses < 1) { setCurrentPlayer(prev => prev === 'black' ? 'white' : 'black'); setLastMove(null); }
  }, [gameOver, gameMode, consecutivePasses, blackCaptures, whiteCaptures, lastMove]); 

  const endGame = (winner: Player, reason: string) => { setGameOver(true); setWinner(winner); setWinReason(reason); if (gameMode === 'PvAI') { if (winner === 'black') playSfx('win'); else playSfx('lose'); } else if (onlineStatus === 'connected') { if (winner === myColor) playSfx('win'); else playSfx('lose'); } else { playSfx('win'); } };

  // AI Turn Handling ... (保留)
  useEffect(() => {
    if (appMode === 'playing' && gameMode === 'PvAI' && currentPlayer === 'white' && !gameOver && !showPassModal) {
      setIsThinking(true);
      const timer = setTimeout(() => {
        let prevHash = null; if (history.length > 0) prevHash = getBoardHash(history[history.length-1].board);
        const move = getAIMove(board, 'white', gameType, difficulty, prevHash);
        if (move) executeMove(move.x, move.y, false); else handlePass();
        setIsThinking(false);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, gameMode, board, gameOver, gameType, difficulty, showPassModal, handlePass, history, appMode]);

  const startReview = () => { setAppMode('review'); setReviewIndex(history.length - 1); setGameOver(false); };
  const startSetup = () => { resetGame(false); setAppMode('setup'); setShowMenu(false); };
  const finishSetup = () => { setAppMode('playing'); setHistory([]); };

  // ... (保留 Render 逻辑和 UI) ...
  const currentDisplayBoard = appMode === 'review' && history[reviewIndex] ? history[reviewIndex].board : board;
  const currentDisplayLastMove = appMode === 'review' && history[reviewIndex] ? history[reviewIndex].lastMove : lastMove;
  const winRate = showWinRate && !gameOver && appMode === 'playing' ? calculateWinRate(board) : 50;
  const getSliderBackground = (val: number, min: number, max: number) => { const percentage = ((val - min) / (max - min)) * 100; return `linear-gradient(to right, #5d4037 ${percentage}%, #d4b483 ${percentage}%)`; };

  const RenderStoneIcon = ({ color }: { color: 'black' | 'white' }) => {
    const filterId = color === 'black' ? 'url(#global-jelly-black)' : 'url(#global-jelly-white)';
    const fillColor = color === 'black' ? '#2a2a2a' : '#f0f0f0';
    return (
        <div className="w-8 h-8 flex items-center justify-center relative">
            <svg viewBox="0 0 24 24" className="w-full h-full overflow-visible">
                <circle cx="12" cy="12" r="10" fill={fillColor} filter={filterId} />
            </svg>
        </div>
    );
  };

  // ... (保留 JSX 返回部分，UI 代码不需要改动) ...
  // 只需要确保 UI 中的按钮调用的是更新后的 joinRoom 和 createRoom 即可 (名字没变，逻辑变了)
  return (
    <div className="h-full w-full bg-[#f7e7ce] flex flex-col md:flex-row items-center relative select-none overflow-hidden text-[#5c4033]">
      
      <audio ref={bgmRef} loop src="/bgm.mp3" />

      {/* --- BOARD AREA --- */}
      {/* ... (这里代码保持不变) ... */}
       <div className="relative flex-grow h-[60%] md:h-full w-full flex items-center justify-center p-2 order-2 md:order-1 min-h-0">
          <div className="w-full h-full max-w-full max-h-full aspect-square flex items-center justify-center">
             <div className="transform transition-transform w-full h-full">
                <GameBoard 
                    board={currentDisplayBoard} 
                    onIntersectionClick={handleIntersectionClick}
                    currentPlayer={currentPlayer}
                    lastMove={currentDisplayLastMove}
                    showQi={showQi}
                    gameType={gameType}
                    showCoordinates={showCoordinates}
                />
             </div>
          </div>
          
          {isThinking && (
              <div className="absolute top-4 left-4 bg-white/80 px-4 py-2 rounded-full text-xs font-bold text-[#5c4033] animate-pulse border-2 border-[#e3c086] shadow-sm z-20">
                  AI 正在思考...
              </div>
          )}
          
          {/* ... (Pass Notification UI 保持不变) ... */}
          {consecutivePasses === 1 && !gameOver && !passNotificationDismissed && (
               <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                    <div className="bg-[#fff8e1] border-4 border-[#cba367] text-[#5c4033] px-6 py-6 rounded-3xl shadow-2xl flex flex-col items-center animate-in zoom-in duration-300 w-64 pointer-events-auto">
                        <div className="flex items-center gap-2 mb-4">
                            <AlertCircle size={28} className="text-[#cba367]" />
                            <span className="text-xl font-black">对手停着</span>
                        </div>
                        <p className="text-xs font-bold text-gray-500 text-center mb-6 leading-relaxed">对手认为无需再落子。<br/>点击空白处可继续。</p>
                        <div className="flex flex-col gap-3 w-full">
                            <button onClick={() => setPassNotificationDismissed(true)} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                                <Play size={16} fill="currentColor" /> 继续
                            </button>
                            <button onClick={() => handlePass(false)} className="btn-retro btn-coffee w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                                <SkipForward size={16} fill="currentColor" /> 结算
                            </button>
                        </div>
                    </div>
                </div>
          )}
      </div>

      {/* --- SIDEBAR --- */}
      {/* ... (这里代码保持不变) ... */}
      <div className="w-full md:w-80 lg:w-96 flex flex-col gap-4 p-4 z-20 shrink-0 bg-[#f7e7ce] md:bg-[#f2e6d6] md:h-full md:border-l-4 md:border-[#e3c086] order-1 md:order-2 shadow-xl md:shadow-none">
        {/* Header */}
        <div className="flex justify-between items-center">
            <div className="flex flex-col">
                <span className="font-black text-[#5c4033] text-xl leading-tight flex items-center gap-2 tracking-wide">
                {appMode === 'setup' ? '电子挂盘' : appMode === 'review' ? '复盘模式' : (gameType === 'Go' ? '围棋' : '五子棋')}
                {appMode === 'playing' && (
                    <span className="text-[10px] font-bold text-[#8c6b38] bg-[#e3c086]/30 px-2 py-1 rounded-full border border-[#e3c086]">
                        {boardSize}路 • {gameMode === 'PvP' ? '双人' : (difficulty === 'Hard' ? '困难' : difficulty === 'Medium' ? '中等' : '简单')} • {onlineStatus === 'connected' ? '在线' : (gameMode === 'PvAI' ? '人机' : '本地')}
                    </span>
                )}
                {onlineStatus === 'connected' && (
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                )}
                </span>
            </div>
            
            <button 
                onClick={() => setShowMenu(true)}
                className="btn-retro btn-brown p-3 rounded-xl"
            >
                <Settings size={20} />
            </button>
        </div>

        {/* ... (Score Card 保持不变) ... */}
        {/* Score Card */}
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
                <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all duration-300 ${currentPlayer === 'black' ? 'bg-[#5c4033] border-[#3e2b22] text-[#f7e7ce] shadow-md scale-105' : 'border-[#e3c086] bg-transparent opacity-60'}`}>
                    <div className="relative">
                        <RenderStoneIcon color="black" />
                        {currentPlayer === 'black' && isThinking && <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-ping"></div>}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-sm">黑子</span>
                        {gameType === 'Go' && <span className="text-[10px] font-bold opacity-80">提子: {blackCaptures}</span>}
                    </div>
                </div>

                <div className={`flex items-center justify-end gap-3 px-4 py-3 rounded-2xl border-2 transition-all duration-300 ${currentPlayer === 'white' ? 'bg-[#fcf6ea] border-[#e3c086] text-[#5c4033] shadow-md scale-105' : 'border-[#e3c086] bg-transparent opacity-60'}`}>
                    <div className="flex flex-col items-end">
                        <span className="font-bold text-sm">白子</span>
                        {gameType === 'Go' && <span className="text-[10px] font-bold opacity-80">提子: {whiteCaptures}</span>}
                    </div>
                    <div className="relative">
                        <RenderStoneIcon color="white" />
                        {currentPlayer === 'white' && isThinking && <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-ping"></div>}
                    </div>
                </div>
            </div>

            {showWinRate && gameType === 'Go' && appMode === 'playing' && (
                <div className="relative w-full h-5 rounded-full overflow-hidden flex shadow-inner mt-2 border border-[#5c4033]/30">
                    <div className="h-full bg-gradient-to-r from-[#2a2a2a] to-[#5c4033] transition-all duration-1000 ease-in-out relative flex items-center" style={{ width: `${winRate}%` }}>
                         <span className="absolute right-2 text-[10px] font-bold text-white/90 whitespace-nowrap">{Math.round(winRate)}%</span>
                    </div>
                    <div className="h-full bg-gradient-to-r from-[#f0f0f0] to-[#ffffff] transition-all duration-1000 ease-in-out" style={{ width: `${100 - winRate}%` }} />
                </div>
            )}
        </div>

        {/* ... (Control Buttons 保持不变) ... */}
         {/* Action Controls */}
        <div className="mt-auto">
            {/* SETUP MODE CONTROLS */}
            {appMode === 'setup' && (
                <div className="grid grid-cols-4 gap-2 mb-2">
                    <button onClick={() => setSetupTool('black')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'black' ? 'bg-[#2a2a2a] text-[#f7e7ce] border-[#000]' : 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]'}`}>
                        <div className="w-4 h-4 rounded-full bg-black border border-gray-600 mb-1"></div>
                        <span className="text-[10px] font-bold">黑子</span>
                    </button>
                    <button onClick={() => setSetupTool('white')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'white' ? 'bg-[#fcf6ea] text-[#5c4033] border-[#e3c086]' : 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]'}`}>
                        <div className="w-4 h-4 rounded-full bg-white border border-gray-300 mb-1"></div>
                        <span className="text-[10px] font-bold">白子</span>
                    </button>
                    <button onClick={() => setSetupTool('erase')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'erase' ? 'bg-[#e57373] text-white border-[#d32f2f]' : 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]'}`}>
                        <Eraser size={16} className="mb-1" />
                        <span className="text-[10px] font-bold">擦除</span>
                    </button>
                     <button onClick={finishSetup} className="btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 bg-[#81c784] text-white border-[#388e3c]">
                        <Play size={16} className="mb-1" fill="currentColor"/>
                        <span className="text-[10px] font-bold">开始</span>
                    </button>
                </div>
            )}

            {/* REVIEW MODE CONTROLS */}
            {appMode === 'review' && (
                <div className="flex flex-col gap-3 mb-2 bg-[#fcf6ea] p-4 rounded-2xl border-2 border-[#e3c086] shadow-sm">
                     <div className="flex justify-between items-center text-xs font-bold text-[#8c6b38]">
                        <span>第 {reviewIndex} 手</span>
                        <span>共 {history.length} 手</span>
                     </div>
                     <input 
                        type="range" min="0" max={history.length > 0 ? history.length - 1 : 0} 
                        value={reviewIndex} onChange={(e) => setReviewIndex(parseInt(e.target.value))}
                        className="cute-range"
                        style={{ background: getSliderBackground(reviewIndex, 0, history.length > 0 ? history.length - 1 : 1) }}
                     />
                     <div className="flex gap-2">
                        <button onClick={() => setReviewIndex(Math.max(0, reviewIndex - 1))} className="btn-retro btn-beige flex-1 py-2 rounded-xl font-bold">上一步</button>
                        <button onClick={() => setReviewIndex(Math.min(history.length - 1, reviewIndex + 1))} className="btn-retro btn-beige flex-1 py-2 rounded-xl font-bold">下一步</button>
                        <button onClick={() => { setAppMode('playing'); setGameOver(true); }} className="btn-retro px-4 bg-[#e3c086] text-[#5c4033] border-[#c4ae88] rounded-xl py-2 font-bold">退出</button>
                     </div>
                </div>
            )}

            {/* PLAYING MODE CONTROLS */}
            {appMode === 'playing' && (
                <div className="grid grid-cols-3 gap-3">
                    <button onClick={handleUndo} disabled={history.length === 0 || isThinking || gameOver || onlineStatus === 'connected'} className="btn-retro btn-sand flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50">
                        <Undo2 size={20} /> <span className="text-xs">悔棋</span>
                    </button>
                    <button onClick={() => handlePass(false)} disabled={gameOver || (onlineStatus === 'connected' && currentPlayer !== myColor)} className={`btn-retro btn-coffee flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50 ${consecutivePasses === 1 ? 'animate-pulse' : ''}`}>
                        <SkipForward size={20} /> <span className="text-xs">{consecutivePasses === 1 ? '结算' : '停着'}</span>
                    </button>
                    <button onClick={() => resetGame(false)} className="btn-retro btn-beige flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold">
                        <RotateCcw size={20} /> <span className="text-xs">重开</span>
                    </button>
                </div>
            )}
        </div>
        
        <div className="hidden md:block flex-grow"></div>
      </div>

      {/* --- SETTINGS MENU (保持不变) --- */}
      {/* ... (这里代码保持不变) ... */}
      {showMenu && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#fcf6ea] rounded-[2rem] w-full max-w-sm shadow-2xl border-[6px] border-[#8c6b38] flex flex-col max-h-[90vh] overflow-hidden relative">
            
            {/* Header */}
            <div className="bg-[#fcf6ea] border-b-2 border-[#e3c086] border-dashed p-4 flex justify-between items-center shrink-0">
                <h2 className="text-2xl font-black text-[#5c4033] tracking-wide">游戏设置</h2>
                <button onClick={() => setShowMenu(false)} className="text-[#8c6b38] hover:text-[#5c4033] bg-[#fff] rounded-full p-2 border-2 border-[#e3c086] transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                
                {/* 1. Game Config */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-[#8c6b38] uppercase tracking-widest mb-1">游戏模式</h3>
                    
                    {/* Game Type & Mode Toggles */}
                    <div className="space-y-4">
                        
                        {/* Type Slider */}
                        <div className="inset-track rounded-xl p-1 relative h-12 flex items-center">
                            <div className={`absolute top-1 bottom-1 w-1/2 bg-[#fcf6ea] rounded-lg shadow-md transition-all duration-300 ease-out z-0 ${tempGameType === 'Gomoku' ? 'translate-x-full left-[-2px]' : 'left-1'}`} />
                            <button 
                                onClick={() => setTempGameType('Go')} 
                                className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameType === 'Go' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}
                            >
                                围棋
                            </button>
                            <button 
                                onClick={() => setTempGameType('Gomoku')} 
                                className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameType === 'Gomoku' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}
                            >
                                五子棋
                            </button>
                        </div>

                        {/* Mode Slider */}
                        <div className="inset-track rounded-xl p-1 relative h-12 flex items-center">
                             <div className={`absolute top-1 bottom-1 w-1/2 bg-[#fcf6ea] rounded-lg shadow-md transition-all duration-300 ease-out z-0 ${tempGameMode === 'PvAI' ? 'translate-x-full left-[-2px]' : 'left-1'}`} />
                            <button 
                                onClick={() => setTempGameMode('PvP')} 
                                className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameMode === 'PvP' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}
                            >
                                双人对战
                            </button>
                            <button 
                                onClick={() => setTempGameMode('PvAI')} 
                                className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameMode === 'PvAI' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}
                            >
                                挑战 AI
                            </button>
                        </div>
                    </div>

                    {/* Board Size */}
                    <div className="px-2 pt-2">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-sm font-bold text-[#5c4033]">棋盘大小</span>
                            <div className="relative">
                                <span className="text-sm font-black text-[#fcf6ea] bg-[#5d4037] px-3 py-1 rounded-lg shadow-sm border-b-2 border-[#3e2723] z-10 relative">
                                    {tempBoardSize} 路
                                </span>
                            </div>
                        </div>
                        <div className="bg-[#fff] px-3 py-1 rounded-full border-2 border-[#e3c086] shadow-sm">
                            <input 
                                type="range" min="4" max="19" step="1"
                                value={tempBoardSize} 
                                onChange={(e) => setTempBoardSize(parseInt(e.target.value))}
                                className="cute-range"
                                style={{ background: getSliderBackground(tempBoardSize, 4, 19) }}
                            />
                        </div>
                    </div>

                    {/* Difficulty */}
                    {tempGameMode === 'PvAI' && (
                        <div className="grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-2 pt-2">
                            {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map((level) => (
                                <button key={level} onClick={() => setTempDifficulty(level)} className={`btn-retro py-2 rounded-xl font-bold text-sm transition-all ${tempDifficulty === level ? 'bg-[#8c6b38] text-[#fcf6ea] border-[#5c4033]' : 'bg-[#fff] text-[#8c6b38] border-[#e3c086]'}`}>
                                    {level === 'Easy' ? '简单' : level === 'Medium' ? '中等' : '困难'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50"></div>

                {/* 2. Visual & Audio */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-[#8c6b38] uppercase tracking-widest mb-1">辅助与音效</h3>
                    
                    <div className="flex gap-2 justify-between">
                        <button onClick={() => setShowWinRate(!showWinRate)} className={`btn-retro flex-1 flex flex-row items-center justify-center gap-2 px-2 py-3 rounded-xl ${showWinRate ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                            <BarChart3 size={18} />
                            <span className="text-sm font-bold">胜率</span>
                        </button>
                        <button onClick={() => setShowCoordinates(!showCoordinates)} className={`btn-retro flex-1 flex flex-row items-center justify-center gap-2 px-2 py-3 rounded-xl ${showCoordinates ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                            <LayoutGrid size={18} />
                            <span className="text-sm font-bold">坐标</span>
                        </button>
                        <button onClick={() => setShowQi(!showQi)} className={`btn-retro flex-1 flex flex-row items-center justify-center gap-2 px-2 py-3 rounded-xl ${showQi ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                            <Wind size={18} />
                            <span className="text-sm font-bold">气</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3 bg-[#fff] p-3 rounded-2xl border-2 border-[#e3c086]">
                        <button onClick={() => setMusicVolume(musicVolume > 0 ? 0 : 0.3)} className="text-[#8c6b38]">
                            {musicVolume > 0 ? <Volume2 size={20}/> : <VolumeX size={20}/>}
                        </button>
                        <input 
                            type="range" min="0" max="1" step="0.1" 
                            value={musicVolume} 
                            onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                            className="cute-range flex-grow"
                            style={{ background: getSliderBackground(musicVolume, 0, 1) }}
                        />
                    </div>
                </div>

                <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50"></div>

                {/* 3. Tools */}
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={startSetup} className="btn-retro btn-beige flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm">
                        <PenTool size={16}/> 电子挂盘
                    </button>
                    <button onClick={() => { setShowImportModal(true); setShowMenu(false); }} className="btn-retro btn-beige flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm">
                        <FileUp size={16}/> 导入/导出
                    </button>
                    <button onClick={() => setShowOnlineMenu(true)} className="btn-retro col-span-2 flex items-center justify-center gap-2 bg-[#90caf9] text-[#1565c0] border-[#64b5f6] py-3 rounded-xl font-bold text-sm">
                        <Globe size={18}/> 联机对战
                    </button>
                </div>

            </div>

            {/* Footer Action */}
            <div className="p-4 bg-[#fcf6ea] border-t-2 border-[#e3c086] flex flex-col gap-2 shrink-0">
                 <button 
                    onClick={applySettingsAndRestart}
                    className="btn-retro btn-brown w-full py-3 rounded-xl font-black tracking-wider flex items-center justify-center gap-2 text-base"
                >
                    <RotateCcw size={18} /> 应用设置并重新开始
                </button>
            </div>

          </div>
        </div>
      )}

      {/* ONLINE MENU (保持不变) */}
      {/* ... (这里代码保持不变) ... */}
      {showOnlineMenu && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
             <div className="bg-[#fcf6ea] rounded-3xl p-6 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] relative overflow-hidden text-center">
                <button onClick={() => setShowOnlineMenu(false)} className="absolute top-4 right-4 text-[#8c6b38] hover:text-[#5c4033]"><X size={24}/></button>
                
                <div className="w-16 h-16 bg-[#e3c086] rounded-full flex items-center justify-center text-[#5c4033] mx-auto mb-4 border-2 border-[#5c4033]">
                    <Globe size={32} />
                </div>
                <h2 className="text-2xl font-black text-[#5c4033] mb-6">联机对战</h2>
                
                <div className="w-full space-y-4">
                    <div className="bg-[#fff] p-4 rounded-xl border-2 border-[#e3c086]">
                        <p className="text-xs font-bold text-[#8c6b38] uppercase mb-2">我的房间号</p>
                        <div className="flex items-center justify-center gap-2">
                            <span className="text-3xl font-black text-[#5c4033] tracking-widest font-mono">{peerId || '...'}</span>
                            <button onClick={copyId} className="p-2 hover:bg-[#fcf6ea] rounded-full transition-colors">
                                {copied ? <Check size={18} className="text-green-500"/> : <Copy size={18} className="text-[#8c6b38]"/>}
                            </button>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Hash size={18} className="text-[#8c6b38]" />
                        </div>
                        <input 
                            type="text" 
                            placeholder="输入对方房间号"
                            value={remotePeerId}
                            onChange={(e) => setRemotePeerId(e.target.value.replace(/[^0-9]/g, '').slice(0,6))}
                            className="w-full pl-10 pr-4 py-3 bg-[#fff] border-2 border-[#e3c086] rounded-xl focus:border-[#5c4033] focus:ring-0 font-mono text-lg font-bold text-center outline-none transition-all text-[#5c4033]"
                        />
                    </div>

                    <button 
                        onClick={joinRoom}
                        disabled={remotePeerId.length < 6 || onlineStatus === 'connecting'}
                        className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                    >
                        {onlineStatus === 'connecting' ? '连接中...' : '加入房间'}
                    </button>
                </div>
             </div>
        </div>
      )}

      {/* IMPORT / EXPORT MODAL (保持不变) */}
      {/* ... (这里代码保持不变) ... */}
      {showImportModal && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#fcf6ea] rounded-3xl p-6 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] relative">
                <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 text-[#8c6b38] hover:text-[#5c4033]"><X size={24}/></button>
                <h2 className="text-xl font-black text-[#5c4033] mb-4 flex items-center gap-2"><FileUp className="text-[#5c4033]"/> 导入/导出棋局</h2>
                
                <div className="space-y-4">
                    <div className="bg-[#fff] p-3 rounded-xl border-2 border-[#e3c086]">
                        <p className="text-xs font-bold text-[#8c6b38] uppercase mb-2">导出当前棋局</p>
                        <button onClick={copyGameState} className="w-full py-2 bg-[#fcf6ea] border border-[#e3c086] text-[#5c4033] font-bold rounded-lg hover:bg-[#e3c086] hover:text-white flex items-center justify-center gap-2 transition-all">
                             {gameCopied ? <Check size={16}/> : <Copy size={16}/>}
                             {gameCopied ? '已复制' : '复制棋局代码'}
                        </button>
                    </div>

                    <div className="bg-[#fff] p-3 rounded-xl border-2 border-[#e3c086]">
                        <p className="text-xs font-bold text-[#8c6b38] uppercase mb-2">导入棋局</p>
                        <textarea 
                            className="w-full p-2 text-xs font-mono bg-[#fcf6ea] border border-[#e3c086] rounded-lg h-20 resize-none outline-none focus:border-[#5c4033] text-[#5c4033]"
                            placeholder="在此粘贴棋局代码..."
                            value={importKey}
                            onChange={(e) => setImportKey(e.target.value)}
                        />
                        <button 
                            onClick={handleImportGame}
                            disabled={!importKey}
                            className="btn-retro btn-brown w-full mt-2 py-2 rounded-lg"
                        >
                            加载棋局
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* GAME OVER MODAL (保持不变) */}
      {/* ... (这里代码保持不变) ... */}
      {gameOver && !showMenu && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => {}} />
            <div className="bg-[#fcf6ea] rounded-3xl p-8 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] flex flex-col items-center text-center animate-in zoom-in duration-300 relative z-50">
                <div className="mb-4">
                    {winner === 'black' ? (
                        <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center shadow-lg border-4 border-gray-700">
                             <Trophy size={40} className="text-yellow-400" />
                        </div>
                    ) : (
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border-4 border-gray-200">
                             <Trophy size={40} className="text-yellow-500" />
                        </div>
                    )}
                </div>
                <h2 className="text-3xl font-black text-[#5c4033] mb-2">{winner === 'black' ? '黑方获胜!' : '白方获胜!'}</h2>
                <p className="text-[#8c6b38] font-bold mb-6 bg-[#e3c086]/30 px-3 py-1 rounded-full text-sm">{winReason}</p>
                
                {finalScore && (
                     <div className="flex gap-8 mb-6 text-sm font-bold text-[#5c4033]">
                        <div className="flex flex-col items-center">
                            <span className="text-xs text-[#8c6b38] uppercase">黑方得分</span>
                            <span className="text-xl text-black">{finalScore.black}</span>
                        </div>
                        <div className="w-px bg-[#e3c086]"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-xs text-[#8c6b38] uppercase">白方得分</span>
                            <span className="text-xl text-gray-500">{finalScore.white}</span>
                        </div>
                     </div>
                )}

                <div className="flex flex-col gap-3 w-full">
                    <button onClick={() => resetGame(true)} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <RotateCcw size={18} /> 再来一局
                    </button>
                    <button onClick={startReview} className="btn-retro btn-beige w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <Eye size={18} /> 复盘
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;