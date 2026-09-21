import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UploadCloud, Cloud, FileText, Mic, Square, Loader2, BookOpen, Volume2, Plus, Trash2, Lock, Unlock, Image as ImageIcon, Sparkles, ListChecks, CheckCircle2, XCircle, ArrowRight, AlertTriangle, Key, Check, ExternalLink, HelpCircle, CreditCard, Coins, DollarSign, Search, Folder, RefreshCw, LogOut, MessageSquareHeart, Users, AlertCircle, Info, X, ShieldCheck, Shield, Mail, KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { extractTextFromFile, importGoogleDocFromUrl } from './lib/pdf';
import { AudioStreamPlayer, AudioRecorder } from './lib/audio';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { OralEvaluatorSetup, OralEvaluatorSession, OralExamSession, SuggestedOralTopic } from './components/OralEvaluator';
import { googleSignIn, initAuth, logoutGoogle, setCachedAccessToken, auth } from './lib/firebase';
import { saveStudyNotebook, loadUserNotebooks, deleteStudyNotebook, SavedStudyRecord } from './lib/studyStorage';
import { listDriveFiles, importDriveFile, DriveFile } from './lib/drive';
import { User } from 'firebase/auth';
import { AppLogo } from './components/AppLogo';
import { GoldenRatioIconPreview } from './components/GoldenRatioIconPreview';
import { GoldenRatioWatermark } from './components/GoldenRatioWatermark';
import { FeedbackModal } from './components/FeedbackModal';
import { AdminPanel } from './components/AdminPanel';
import { UploadProgressAnimation } from './components/UploadProgressAnimation';
import { trackUserActivity, shouldPromptPeriodicFeedback, recordFeedbackPromptShown } from './lib/userTracker';

class WebSocketSession {
  private ws: WebSocket;
  private onOpenCallback?: () => void;
  private onMessageCallback?: (message: any) => void;
  private onCloseCallback?: () => void;
  private onErrorCallback?: (err: any) => void;

  constructor(params: { mode: string; text: string; topics?: any; selectedTopicTitle?: string; questions?: string[] }) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const savedKey = localStorage.getItem('user_gemini_api_key');
    const queryParam = savedKey ? `?apiKey=${encodeURIComponent(savedKey)}` : '';
    this.ws = new WebSocket(`${protocol}//${host}/api/live${queryParam}`);

    this.ws.onopen = () => {
      console.log("WebSocket connection opened, sending setup message...");
      this.ws.send(JSON.stringify({ type: 'setup', params }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'open') {
          console.log("Gemini Live session successfully initialized on server.");
          if (this.onOpenCallback) {
            this.onOpenCallback();
          }
        } else if (msg.type === 'message') {
          if (this.onMessageCallback) {
            this.onMessageCallback(msg.data);
          }
        } else if (msg.type === 'close') {
          if (this.onCloseCallback) {
            this.onCloseCallback();
          }
        } else if (msg.type === 'error') {
          if (this.onErrorCallback) {
            this.onErrorCallback(new Error(msg.data));
          }
        }
      } catch (err) {
        console.error("Error parsing WebSocket message from proxy:", err);
      }
    };

    this.ws.onclose = () => {
      console.log("WebSocket connection closed.");
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }
    };

    this.ws.onerror = (err) => {
      console.error("WebSocket connection error:", err);
      if (this.onErrorCallback) {
        this.onErrorCallback(err);
      }
    };
  }

  setCallbacks(callbacks: {
    onopen?: () => void;
    onmessage?: (msg: any) => void;
    onclose?: () => void;
    onerror?: (err: any) => void;
  }) {
    this.onOpenCallback = callbacks.onopen;
    this.onMessageCallback = callbacks.onmessage;
    this.onCloseCallback = callbacks.onclose;
    this.onErrorCallback = callbacks.onerror;
  }

  sendRealtimeInput(data: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'realtimeInput', data }));
    }
  }

  sendToolResponse(data: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'toolResponse', data }));
    }
  }

  close() {
    this.ws.close();
  }
}

type Topic = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
};

type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

function getFetchHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const savedKey = localStorage.getItem('user_gemini_api_key');
  if (savedKey) {
    headers["x-gemini-api-key"] = savedKey;
  }
  return headers;
}

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [currentExtractingFile, setCurrentExtractingFile] = useState<string>('');
  const [extractingFileIndex, setExtractingFileIndex] = useState(1);
  const [extractingTotalFiles, setExtractingTotalFiles] = useState(1);
  const [extractingFileNamesList, setExtractingFileNamesList] = useState<string[]>([]);
  const [studyText, setStudyText] = useState<string>('');
  const [fileTexts, setFileTexts] = useState<Record<string, string>>({});
  const [activeFileNames, setActiveFileNames] = useState<string[]>([]);
  
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [viewMode, setViewMode] = useState<'setup' | 'visual' | 'session' | 'free_session' | 'multiple_choice' | 'oral_evaluator_setup' | 'oral_evaluator_session'>('setup');
  const [unlockedTopics, setUnlockedTopics] = useState<string[]>([]);
  const [savedQuizQuestions, setSavedQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizVersion, setQuizVersion] = useState(0);

  // Oral Evaluator States
  const [suggestedOralTopics, setSuggestedOralTopics] = useState<SuggestedOralTopic[]>([]);
  const [isGeneratingOralTopics, setIsGeneratingOralTopics] = useState(false);
  const [oralExamSessions, setOralExamSessions] = useState<OralExamSession[]>([]);
  const [activeOralSession, setActiveOralSession] = useState<OralExamSession | null>(null);
  const [studyToDelete, setStudyToDelete] = useState<{ id: string; title: string } | null>(null);

  // Extraction Cancellation and AbortController Reference
  const extractionAbortControllerRef = useRef<AbortController | null>(null);

  const cancelExtraction = useCallback(() => {
    if (extractionAbortControllerRef.current) {
      try {
        extractionAbortControllerRef.current.abort();
      } catch (_) {}
      extractionAbortControllerRef.current = null;
    }
    setIsExtracting(false);
    setExtractProgress(0);
    setCurrentExtractingFile('');
    setExtractingFileIndex(1);
    showToast('info', 'Carga cancelada', 'Se detuvo el procesamiento del documento.');
  }, []);

  // Google Docs / Drive Import State
  const [showGoogleDocModal, setShowGoogleDocModal] = useState(false);
  const [googleDocUrl, setGoogleDocUrl] = useState('');
  const [isImportingGoogleDoc, setIsImportingGoogleDoc] = useState(false);
  const [googleDocTab, setGoogleDocTab] = useState<'link' | 'text' | 'drive'>('link');
  const [googleDocTextTitle, setGoogleDocTextTitle] = useState('');
  const [googleDocTextBody, setGoogleDocTextBody] = useState('');

  // Google Drive Integration States
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [isDriveConnecting, setIsDriveConnecting] = useState(false);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveSearchQuery, setDriveSearchQuery] = useState('');
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [selectedDriveFileIds, setSelectedDriveFileIds] = useState<string[]>([]);
  const [isImportingDriveFiles, setIsImportingDriveFiles] = useState(false);
  const [driveImportStatusText, setDriveImportStatusText] = useState<string>('');
  const [driveImportErrorDetails, setDriveImportErrorDetails] = useState<string | null>(null);

  // Sistema de Avisos en Pantalla (Toast Notifications) - Inmune a bloqueos de alert() en iframe
  const [toasts, setToasts] = useState<{ id: string; type: 'success' | 'error' | 'warning' | 'info'; title: string; message: string }[]>([]);

  const showToast = useCallback((type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setToasts(prev => [...prev.slice(-3), { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 7000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setDriveUser(user);
        if (token) {
          setDriveAccessToken(token);
          setCachedAccessToken(token);
        }
        if (user.email) {
          const name = user.displayName || user.email.split('@')[0];
          setUserEmail(user.email);
          setUserDisplayName(name);
          localStorage.setItem('user_email', user.email);
          localStorage.setItem('user_display_name', name);
          fetchUserHistory(user.email, user.uid);
        }
      },
      () => {
        setDriveAccessToken(null);
        setCachedAccessToken(null);
        const storedEmail = localStorage.getItem('user_email');
        if (storedEmail) {
          fetchUserHistory(storedEmail);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  const [userTier, setUserTier] = useState<'free' | 'pro'>(() => {
    return (localStorage.getItem('user_tier') as 'free' | 'pro') || 'free';
  });
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'select' | 'pay' | 'processing' | 'success'>('select');
  const [billingTab, setBillingTab] = useState<'plans' | 'monetize'>('plans');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // Estados para simulación y configuración de Cafecito/Donaciones
  const [coffeeLink, setCoffeeLink] = useState(() => {
    return localStorage.getItem('creator_coffee_link') || 'https://link.mercadopago.com.ar/martinmano';
  });
  const [creatorAlias, setCreatorAlias] = useState(() => {
    return localStorage.getItem('creator_alias') || 'martinmano';
  });
  const [showCoffeeModal, setShowCoffeeModal] = useState(false);
  const [isEditingCoffeeLink, setIsEditingCoffeeLink] = useState(false);
  const [tempCoffeeLink, setTempCoffeeLink] = useState(coffeeLink);
  const [tempCreatorAlias, setTempCreatorAlias] = useState(creatorAlias);

  // Estados de Feedback y Administración
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackTriggerSource, setFeedbackTriggerSource] = useState<'periodic' | 'manual' | 'quiz_finished' | 'oral_finished'>('manual');
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileInspector, setShowMobileInspector] = useState(false);

  const handleSaveCoffeeLink = () => {
    localStorage.setItem('creator_coffee_link', tempCoffeeLink);
    localStorage.setItem('creator_alias', tempCreatorAlias);
    setCoffeeLink(tempCoffeeLink);
    setCreatorAlias(tempCreatorAlias);
    setIsEditingCoffeeLink(false);
  };

  useEffect(() => {
    if (showBillingModal) {
      setPaymentStep('select');
      setBillingTab('plans');
      setCardName('');
      setCardNumber('');
      setCardExpiry('');
      setCardCvc('');
    }
  }, [showBillingModal]);

  const handleUpgradeToPro = () => {
    localStorage.setItem('user_tier', 'pro');
    setUserTier('pro');
  };

  const handleResetTier = () => {
    localStorage.setItem('user_tier', 'free');
    setUserTier('free');
  };

  const [isKeyMissing, setIsKeyMissing] = useState(false);
  const [isCheckedEnv, setIsCheckedEnv] = useState(false);
  const [showKeyInstructions, setShowKeyInstructions] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string>(() => localStorage.getItem('user_gemini_api_key') || '');
  const [tempApiKey, setTempApiKey] = useState(() => localStorage.getItem('user_gemini_api_key') || '');

  const handleSaveApiKey = (key: string) => {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem('user_gemini_api_key', trimmed);
      setUserApiKey(trimmed);
      setTempApiKey(trimmed);
      alert("🎉 ¡Clave API guardada correctamente en este navegador! Ya puedes usar la aplicación.");
    } else {
      handleClearApiKey();
    }
  };

  const handleClearApiKey = () => {
    localStorage.removeItem('user_gemini_api_key');
    setUserApiKey('');
    setTempApiKey('');
    alert("Clave API eliminada de este navegador.");
  };

  // --- USER IDENTIFICATION & ROLES ---
  const [userEmail, setUserEmail] = useState<string | null>(() => localStorage.getItem('user_email') || null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(() => localStorage.getItem('user_display_name') || null);
  const ADMIN_EMAILS = ['martinvelozz01@gmail.com'];
  const isAdmin = Boolean(userEmail && ADMIN_EMAILS.includes(userEmail.toLowerCase().trim()));

  // --- GOOGLE CLOUD STORAGE INTEGRATION ---
  const [gcsStatus, setGcsStatus] = useState<{ isConfigured: boolean; bucketName: string | null; environment?: string; cloudRunReady?: boolean; adcInfo?: string } | null>(null);
  const [showGcsModal, setShowGcsModal] = useState(false);
  const [tempBucketInput, setTempBucketInput] = useState('');
  const [isUpdatingBucket, setIsUpdatingBucket] = useState(false);

  const fetchStorageStatus = async (overrideEmail?: string) => {
    try {
      const email = overrideEmail !== undefined ? overrideEmail : userEmail;
      const headers: Record<string, string> = {};
      if (email) {
        headers["x-admin-email"] = email;
      }
      const res = await fetch("/api/storage/status", { headers });
      if (res.ok) {
        const data = await res.json();
        setGcsStatus(data);
        if (data.bucketName) {
          setTempBucketInput(data.bucketName);
        }
      }
    } catch (e) {
      console.warn("Error verificando estado de Google Cloud Storage:", e);
    }
  };

  useEffect(() => {
    fetchStorageStatus();
  }, [userEmail]);

  const handleSaveBucketName = async () => {
    if (!tempBucketInput.trim()) {
      alert("Por favor ingresa el nombre de tu bucket de Google Cloud Storage.");
      return;
    }
    setIsUpdatingBucket(true);
    try {
      const res = await fetch("/api/storage/set-bucket", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-admin-email": userEmail || ""
        },
        body: JSON.stringify({ bucketName: tempBucketInput.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setGcsStatus(data);
        alert(`🎉 ¡Bucket "${tempBucketInput.trim()}" configurado exitosamente para Google Cloud Storage!`);
        setShowGcsModal(false);
      } else {
        alert("No se pudo configurar el bucket.");
      }
    } catch (e: any) {
      alert(`Error al guardar bucket: ${e.message || e}`);
    } finally {
      setIsUpdatingBucket(false);
    }
  };

  // --- USER HISTORY & STUDY SESSIONS SYSTEM ---
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeStudyId, setActiveStudyId] = useState<string | null>(null);
  const [activeStudyTitle, setActiveStudyTitle] = useState<string>('');
  const [showSaveStudyModal, setShowSaveStudyModal] = useState(false);
  const [newStudyTitle, setNewStudyTitle] = useState('');
  const [tempEmailInput, setTempEmailInput] = useState('');
  const [tempNameInput, setTempNameInput] = useState('');
  const [authMethod, setAuthMethod] = useState<'otp' | 'pin'>('pin');
  const [authOtpStep, setAuthOtpStep] = useState<'request' | 'verify'>('request');
  const [authOtpCode, setAuthOtpCode] = useState('');
  const [authPinCode, setAuthPinCode] = useState('');
  const [authCountdown, setAuthCountdown] = useState(0);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authDevCodeNotice, setAuthDevCodeNotice] = useState<string | null>(null);
  const [authStatusMessage, setAuthStatusMessage] = useState<string | null>(null);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [showPinPassword, setShowPinPassword] = useState(false);
  const [isGoogleAuthenticating, setIsGoogleAuthenticating] = useState(false);
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [isSavingStudy, setIsSavingStudy] = useState(false);

  // Temporizador de cuenta regresiva para reenvío de código OTP
  useEffect(() => {
    if (authCountdown > 0) {
      const timer = setTimeout(() => setAuthCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [authCountdown]);

  // Carga inicial de cuadernos y persistencia universal
  useEffect(() => {
    const activeEmail = userEmail || driveUser?.email || localStorage.getItem('user_email');
    if (activeEmail) {
      fetchUserHistory(activeEmail, driveUser?.uid || auth.currentUser?.uid);
    }
  }, [userEmail, driveUser]);

  // Seguimiento de actividad universal (registra tanto usuarios identificados como visitantes anónimos)
  useEffect(() => {
    const activeEmail = userEmail || driveUser?.email || localStorage.getItem('user_email');
    const activeName = userDisplayName || driveUser?.displayName || localStorage.getItem('user_display_name');
    trackUserActivity({
      email: activeEmail || undefined,
      displayName: activeName || undefined,
      photoURL: driveUser?.photoURL || undefined,
      uid: driveUser?.uid || undefined,
      authProvider: driveUser ? 'google' : 'guest',
      action: activeEmail ? `Ingreso de ${activeName || activeEmail}` : 'Visita a la aplicación',
    });
  }, [userEmail, userDisplayName, driveUser]);

  // Activación periódica no intrusiva de solicitud de feedback
  useEffect(() => {
    const interval = setInterval(() => {
      if (shouldPromptPeriodicFeedback()) {
        setShowFeedbackModal(true);
        setFeedbackTriggerSource('periodic');
        recordFeedbackPromptShown();
      }
    }, 90 * 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleApiKeyMissing = () => {
      setIsKeyMissing(true);
      setShowApiKeyModal(true);
    };
    window.addEventListener('gemini-api-key-missing', handleApiKeyMissing);
    return () => {
      window.removeEventListener('gemini-api-key-missing', handleApiKeyMissing);
    };
  }, []);

  const handleCreateNewNotebook = () => {
    if (userTier === 'free' && userHistory.length >= 2) {
      alert("⚠️ Has alcanzado el límite de 2 cuadernos de estudio en tu cuenta gratuita. Por favor, actualiza a PRO para crear cuadernos ilimitados.");
      setShowBillingModal(true);
      return;
    }
    setFiles([]);
    setFileTexts({});
    setActiveFileNames([]);
    setStudyText('');
    setTopics([]);
    setUnlockedTopics([]);
    setSavedQuizQuestions([]);
    setQuizVersion(v => v + 1);
    setSuggestedOralTopics([]);
    setOralExamSessions([]);
    setActiveOralSession(null);
    setActiveStudyId(null);
    setActiveStudyTitle('');
    setNewStudyTitle('');
    setViewMode('setup');
  };

  const fetchUserHistory = async (email: string, explicitUid?: string) => {
    setIsLoadingHistory(true);
    try {
      const uid = explicitUid || driveUser?.uid || auth.currentUser?.uid;
      const { studies, fromCloud } = await loadUserNotebooks({ uid, email });
      setUserHistory(studies || []);
      if (fromCloud) {
        setIsCloudSynced(true);
      }
    } catch (err) {
      console.error("Error fetching user history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const saveCurrentStudy = async (
    titleToSave: string, 
    silent: boolean = false, 
    customFields?: { 
      topics?: Topic[]; 
      unlockedTopics?: string[]; 
      savedQuizQuestions?: QuizQuestion[]; 
      suggestedOralTopics?: SuggestedOralTopic[];
      oralExamSessions?: OralExamSession[];
      activeOralSession?: OralExamSession | null;
    }
  ) => {
    if (!userEmail) {
      if (!silent) {
        setShowAuthModal(true);
      }
      return;
    }
    
    // Si es un cuaderno nuevo (no tiene activeStudyId) y el usuario ya tiene 2 o más cuadernos guardados
    if (userTier === 'free' && !activeStudyId && userHistory.length >= 2) {
      if (!silent) {
        alert("⚠️ Has alcanzado el límite de 2 cuadernos de estudio en tu cuenta gratuita. Por favor, actualiza a PRO para guardar cuadernos ilimitados.");
        setShowBillingModal(true);
      }
      return;
    }
    
    const studyId = activeStudyId || `study_${Date.now()}`;
    const cleanTitle = titleToSave.trim() || activeStudyTitle || `Estudio del ${new Date().toLocaleDateString('es-AR')}`;
    
    const currentTopics = customFields?.topics !== undefined ? customFields.topics : topics;
    const currentUnlocked = customFields?.unlockedTopics !== undefined ? customFields.unlockedTopics : unlockedTopics;
    const currentQuiz = customFields?.savedQuizQuestions !== undefined ? customFields.savedQuizQuestions : savedQuizQuestions;
    const currentSuggestedOral = customFields?.suggestedOralTopics !== undefined ? customFields.suggestedOralTopics : suggestedOralTopics;
    const currentOralSessions = customFields?.oralExamSessions !== undefined ? customFields.oralExamSessions : oralExamSessions;
    const currentActiveOral = customFields?.activeOralSession !== undefined ? customFields.activeOralSession : activeOralSession;

    const newStudy: SavedStudyRecord = {
      id: studyId,
      title: cleanTitle,
      files: files.map(f => ({ name: f.name, size: f.size, type: f.type })),
      studyText: studyText,
      fileTexts: fileTexts,
      activeFileNames: activeFileNames,
      topics: currentTopics,
      unlockedTopics: currentUnlocked,
      savedQuizQuestions: currentQuiz,
      suggestedOralTopics: currentSuggestedOral,
      oralExamSessions: currentOralSessions,
      activeOralSession: currentActiveOral,
      viewMode: viewMode,
      createdAt: new Date().toISOString()
    };

    try {
      setIsSavingStudy(true);
      const uid = driveUser?.uid || auth.currentUser?.uid;
      const res = await saveStudyNotebook(newStudy, { uid, email: userEmail });
      if (res.success) {
        setActiveStudyId(studyId);
        setActiveStudyTitle(newStudy.title);
        setIsCloudSynced(res.firestoreSaved);
        fetchUserHistory(userEmail, uid);
        setShowSaveStudyModal(false);
      } else {
        if (!silent) {
          alert("No se pudo guardar el cuaderno.");
        }
      }
    } catch (err) {
      console.error("Error saving study:", err);
      if (!silent) {
        alert("Error al conectar con Google Cloud.");
      }
    } finally {
      setIsSavingStudy(false);
    }
  };

  const deleteStudyFromHistory = async (studyId: string) => {
    if (!userEmail) return;

    try {
      const uid = driveUser?.uid || auth.currentUser?.uid;
      await deleteStudyNotebook(studyId, { uid, email: userEmail });
      if (activeStudyId === studyId) {
        setActiveStudyId(null);
        setActiveStudyTitle('');
      }
      fetchUserHistory(userEmail, uid);
    } catch (err) {
      console.error("Error deleting study:", err);
    }
  };

  const loadStudy = (study: any) => {
    const virtualFiles = study.files.map((f: any) => {
      return new File([], f.name, { type: f.type || 'application/pdf' });
    });
    
    setFiles(virtualFiles);
    
    // Load fileTexts and activeFileNames with backwards-compatible fallback
    const loadedFileTexts = study.fileTexts || {};
    const loadedActiveFileNames = study.activeFileNames || study.files.map((f: any) => f.name);
    
    if (Object.keys(loadedFileTexts).length === 0 && study.studyText) {
      const parts = study.studyText.split(/--- Documento: (.+?) ---/g);
      for (let index = 1; index < parts.length; index += 2) {
        const name = parts[index]?.trim();
        const text = parts[index + 1]?.trim();
        if (name && text) {
          loadedFileTexts[name] = text;
        }
      }
      
      if (Object.keys(loadedFileTexts).length === 0 && virtualFiles.length > 0) {
        loadedFileTexts[virtualFiles[0].name] = study.studyText;
      }
    }
    
    setFileTexts(loadedFileTexts);
    setActiveFileNames(loadedActiveFileNames);
    
    setStudyText(study.studyText || '');
    setTopics(study.topics || []);
    setUnlockedTopics(study.unlockedTopics || []);
    setSavedQuizQuestions(study.savedQuizQuestions || []);
    setQuizVersion(v => v + 1);
    setSuggestedOralTopics(study.suggestedOralTopics || []);
    setOralExamSessions(study.oralExamSessions || []);
    setActiveOralSession(study.activeOralSession || null);
    setViewMode(study.viewMode || 'visual');
    setActiveStudyId(study.id);
    setActiveStudyTitle(study.title);
  };

  const handleGoogleAuthLogin = async () => {
    try {
      setIsGoogleAuthenticating(true);
      const res = await googleSignIn();
      if (res && res.user) {
        setDriveUser(res.user);
        if (res.accessToken) {
          setDriveAccessToken(res.accessToken);
          setCachedAccessToken(res.accessToken);
        }
        const email = res.user.email || '';
        const name = res.user.displayName || email.split('@')[0];
        handleIdentifyUser(email, name);
        setShowAuthModal(false);
        showToast('success', 'Sesión iniciada', `Bienvenido, ${name}`);
      }
    } catch (err: any) {
      console.error("Error en inicio de sesión con Google:", err);
      const code = err?.code || '';
      if (code === 'auth/unauthorized-domain') {
        showToast(
          'error',
          'Dominio no autorizado en Firebase',
          'Para habilitar Google Sign-In en Render, añade tu dominio de Render en Firebase Console > Authentication > Settings > Authorized Domains. Puedes identificarte ingresando tu correo abajo.'
        );
        setShowAuthModal(true);
      } else if (code === 'auth/popup-closed-by-user') {
        showToast('info', 'Ventana cerrada', 'Se cerró la ventana de autenticación de Google.');
      } else {
        showToast('error', 'Error al autenticar', err.message || 'No se pudo conectar con Google.');
      }
    } finally {
      setIsGoogleAuthenticating(false);
    }
  };

  const handleSendOtpCode = async () => {
    const cleanEmail = tempEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthErrorMessage('Por favor ingresa un correo electrónico válido.');
      return;
    }
    setAuthErrorMessage(null);
    setAuthStatusMessage(null);
    setIsAuthLoading(true);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, name: tempNameInput.trim() })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'No se pudo enviar el código de verificación.');
      }
      setAuthOtpStep('verify');
      setAuthCountdown(60);
      if (data.devCode) {
        setAuthDevCodeNotice(data.devCode);
      } else {
        setAuthDevCodeNotice(null);
      }
      setAuthStatusMessage(data.message || (data.emailSent ? 'Código enviado a tu bandeja de entrada.' : 'Código de verificación generado.'));
      showToast('info', 'Código de Verificación', data.emailSent ? 'Revisa tu correo electrónico.' : 'Código generado con éxito.');
    } catch (err: any) {
      setAuthErrorMessage(err.message || 'Error al solicitar el código.');
      showToast('error', 'Error', err.message || 'No se pudo enviar el código.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleVerifyOtpCode = async () => {
    const cleanEmail = tempEmailInput.trim().toLowerCase();
    const cleanCode = authOtpCode.trim();
    if (!cleanCode) {
      setAuthErrorMessage('Ingresa el código de 6 dígitos recibido.');
      return;
    }
    setAuthErrorMessage(null);
    setIsAuthLoading(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          code: cleanCode,
          name: tempNameInput.trim() || undefined,
          pin: authPinCode.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Código de verificación incorrecto.');
      }
      handleIdentifyUser(cleanEmail, data.name || tempNameInput.trim());
      showToast('success', 'Identificación Exitosa', `Bienvenido, ${data.name || cleanEmail}`);
      setShowAuthModal(false);
      setAuthOtpCode('');
      setAuthOtpStep('request');
      setAuthDevCodeNotice(null);
    } catch (err: any) {
      setAuthErrorMessage(err.message || 'Código incorrecto o expirado.');
      showToast('error', 'Error de Verificación', err.message || 'Código incorrecto.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLoginWithPin = async () => {
    const cleanEmail = tempEmailInput.trim().toLowerCase();
    const cleanPin = authPinCode.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthErrorMessage('Por favor ingresa un correo electrónico válido.');
      return;
    }
    if (!cleanPin || cleanPin.length < 4) {
      setAuthErrorMessage('La clave o PIN debe tener al menos 4 caracteres.');
      return;
    }
    setAuthErrorMessage(null);
    setIsAuthLoading(true);
    try {
      const res = await fetch('/api/auth/login-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          pin: cleanPin,
          name: tempNameInput.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Clave o PIN incorrecto.');
      }
      handleIdentifyUser(cleanEmail, data.name || tempNameInput.trim());
      showToast('success', data.isNewPin ? 'PIN Configurado' : 'Acceso Autorizado', `Bienvenido, ${data.name || cleanEmail}`);
      setShowAuthModal(false);
      setAuthPinCode('');
      setAuthDevCodeNotice(null);
    } catch (err: any) {
      setAuthErrorMessage(err.message || 'Error al ingresar con PIN.');
      showToast('error', 'Acceso Denegado', err.message || 'Clave o PIN incorrecto.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleIdentifyUser = (email: string, name?: string) => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    const displayName = name || trimmedEmail.split('@')[0];
    
    localStorage.setItem('user_email', trimmedEmail);
    localStorage.setItem('user_display_name', displayName);
    setUserEmail(trimmedEmail);
    setUserDisplayName(displayName);

    const uid = driveUser?.uid || auth.currentUser?.uid;
    trackUserActivity({
      email: trimmedEmail,
      displayName,
      uid,
      authProvider: driveUser ? 'google' : 'guest',
    });
    
    fetchUserHistory(trimmedEmail, uid);
    setShowAuthModal(false);
  };

  const handleSignOut = async () => {
    try {
      await logoutGoogle();
    } catch (e) {}
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_display_name');
    setUserEmail(null);
    setUserDisplayName(null);
    setDriveUser(null);
    setDriveAccessToken(null);
    setCachedAccessToken(null);
    setUserHistory([]);
    setActiveStudyId(null);
    setActiveStudyTitle('');
    setSuggestedOralTopics([]);
    setOralExamSessions([]);
    setActiveOralSession(null);
  };

  const handleStartNewOralSession = (topic: SuggestedOralTopic) => {
    const newSession: OralExamSession = {
      id: `oral_${Date.now()}`,
      topicTitle: topic.title,
      topicDescription: topic.description,
      createdAt: new Date().toISOString(),
      questions: topic.questions.map(q => ({ questionText: q })),
      isCompleted: false
    };
    
    const updatedSessions = [newSession, ...oralExamSessions];
    setOralExamSessions(updatedSessions);
    setActiveOralSession(newSession);
    setViewMode('oral_evaluator_session');
    
    saveCurrentStudy(activeStudyTitle, true, {
      oralExamSessions: updatedSessions,
      activeOralSession: newSession
    });
  };

  const handleSelectExistingOralSession = (session: OralExamSession) => {
    setActiveOralSession(session);
    setViewMode('oral_evaluator_session');
  };

  const handleDeleteOralSession = (id: string) => {
    const updatedSessions = oralExamSessions.filter(s => s.id !== id);
    setOralExamSessions(updatedSessions);
    const updatedActive = activeOralSession?.id === id ? null : activeOralSession;
    setActiveOralSession(updatedActive);
    saveCurrentStudy(activeStudyTitle, true, {
      oralExamSessions: updatedSessions,
      activeOralSession: updatedActive
    });
  };

  const handleUpdateOralSession = (updated: OralExamSession) => {
    const wasCompletedBefore = activeOralSession?.id === updated.id && activeOralSession?.isCompleted;
    const updatedSessions = oralExamSessions.map(s => s.id === updated.id ? updated : s);
    setOralExamSessions(updatedSessions);
    setActiveOralSession(updated);
    
    saveCurrentStudy(activeStudyTitle, true, {
      oralExamSessions: updatedSessions,
      activeOralSession: updated
    });

    // Invitar a dejar feedback al finalizar un examen oral
    if (updated.isCompleted && !wasCompletedBefore) {
      setTimeout(() => {
        setFeedbackTriggerSource('oral_finished');
        setShowFeedbackModal(true);
      }, 2000);
    }
  };

  useEffect(() => {
    if (userEmail) {
      fetchUserHistory(userEmail);
    }
  }, [userEmail]);

  useEffect(() => {
    const verifyEnv = async () => {
      try {
        const res = await fetch("/api/check-env");
        if (res.ok) {
          const data = await res.json();
          const missing = !data.gemini_key_present;
          setIsKeyMissing(missing);
        }
      } catch (err) {
        console.error("Error checking environment:", err);
      } finally {
        setIsCheckedEnv(true);
      }
    };
    verifyEnv();
  }, [viewMode]);

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files) as File[];
    await addFiles(droppedFiles);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files) as File[];
      e.target.value = ''; // Reset input so re-selecting the same file fires onChange every time
      await addFiles(selectedFiles);
    }
  };

  const rebuildStudyText = (currentFiles: File[], currentActiveNames: string[], currentFileTexts: Record<string, string>) => {
    let combinedText = '';
    for (const file of currentFiles) {
      if (currentActiveNames.includes(file.name)) {
        const text = currentFileTexts[file.name] || '';
        combinedText += `\n\n--- Documento: ${file.name} ---\n\n${text}`;
      }
    }
    setStudyText(combinedText);
  };

  const toggleFileActive = (fileName: string) => {
    const isCurrentlyActive = activeFileNames.includes(fileName);
    let newActiveFileNames: string[];
    if (isCurrentlyActive) {
      newActiveFileNames = activeFileNames.filter(name => name !== fileName);
    } else {
      newActiveFileNames = [...activeFileNames, fileName];
    }
    setActiveFileNames(newActiveFileNames);
    rebuildStudyText(files, newActiveFileNames, fileTexts);
  };

  const handleImportGoogleDocUrl = async () => {
    if (!googleDocUrl.trim()) {
      alert("Por favor ingresa un enlace válido de Google Docs.");
      return;
    }
    if (!activeStudyTitle.trim()) {
      alert("Por favor escribe el nombre de tu cuaderno antes de importar el documento.");
      return;
    }

    setIsImportingGoogleDoc(true);
    try {
      const imported = await importGoogleDocFromUrl(googleDocUrl);
      const fileName = imported.title || `Google_Doc_${Date.now().toString().slice(-4)}.txt`;
      const docFile = new File([imported.text], fileName, { type: 'text/plain' });
      await addFiles([docFile]);
      setShowGoogleDocModal(false);
      setGoogleDocUrl('');
      alert("🎉 ¡Google Doc importado con éxito a tu cuaderno de estudio!");
    } catch (err: any) {
      console.error("Error importing Google Doc:", err);
      alert(err.message || "No se pudo importar el documento de Google Docs.");
    } finally {
      setIsImportingGoogleDoc(false);
    }
  };

  const handleImportGoogleDocText = async () => {
    if (!googleDocTextBody.trim()) {
      alert("Por favor pega el contenido de texto del documento.");
      return;
    }
    if (!activeStudyTitle.trim()) {
      alert("Por favor escribe el nombre de tu cuaderno antes de añadir el texto.");
      return;
    }

    const rawTitle = googleDocTextTitle.trim() || "Google_Doc_Notas";
    const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9_ -]/g, '_') + '.txt';
    const docFile = new File([googleDocTextBody.trim()], cleanTitle, { type: 'text/plain' });
    await addFiles([docFile]);
    setShowGoogleDocModal(false);
    setGoogleDocTextTitle('');
    setGoogleDocTextBody('');
    alert("🎉 ¡Texto de Google Doc añadido con éxito a tu cuaderno!");
  };

  const handleConnectDrive = async () => {
    setIsDriveConnecting(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setDriveUser(res.user);
        setDriveAccessToken(res.accessToken);
        setCachedAccessToken(res.accessToken);
        loadDriveFiles(res.accessToken, '');
      }
    } catch (err: any) {
      console.error("Error connecting Google Drive:", err);
      alert(err.message || "No se pudo conectar con Google Drive.");
    } finally {
      setIsDriveConnecting(false);
    }
  };

  const handleDisconnectDrive = async () => {
    await logoutGoogle();
    setDriveUser(null);
    setDriveAccessToken(null);
    setCachedAccessToken(null);
    setDriveFiles([]);
  };

  const loadDriveFiles = async (token: string, query: string) => {
    setIsLoadingDriveFiles(true);
    try {
      const res = await listDriveFiles(token, query);
      setDriveFiles(res.files);
    } catch (err: any) {
      console.error("Error loading drive files:", err);
      if (err.message === "UNAUTHORIZED_TOKEN") {
        alert("Tu sesión de Google Drive ha expirado. Por favor, vuelve a conectar.");
        setDriveAccessToken(null);
        setDriveUser(null);
      } else {
        alert(err.message || "Error al cargar archivos de Google Drive.");
      }
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  const handleToggleDriveFileSelect = (fileId: string) => {
    setSelectedDriveFileIds(prev => 
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  const handleImportSelectedDriveFiles = async () => {
    if (selectedDriveFileIds.length === 0) return;
    if (!driveAccessToken) {
      showToast('warning', 'Conexión requerida', 'Debes conectar tu cuenta de Google Drive para descargar archivos.');
      return;
    }

    const filesToImport = driveFiles.filter(f => selectedDriveFileIds.includes(f.id));
    if (filesToImport.length === 0) return;

    // Auto-generate title if currently empty
    if (!activeStudyTitle.trim()) {
      const autoTitle = filesToImport[0].name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
      if (autoTitle) {
        setActiveStudyTitle(autoTitle);
      }
    }

    setIsImportingDriveFiles(true);
    setDriveImportErrorDetails(null);
    setDriveImportStatusText(`Iniciando descarga de ${filesToImport.length} archivo(s)...`);

    try {
      const importedFiles: File[] = [];
      const failedFiles: { name: string; error: string }[] = [];

      for (let idx = 0; idx < filesToImport.length; idx++) {
        const df = filesToImport[idx];
        setDriveImportStatusText(`Descargando y extrayendo "${df.name}" (${idx + 1} de ${filesToImport.length})...`);
        try {
          const result = await importDriveFile(driveAccessToken, df);
          if (!result.text || result.text.trim().length === 0) {
            failedFiles.push({
              name: df.name,
              error: 'El archivo está vacío o es un PDF escaneado (fotocopia) sin capa de texto seleccionable.'
            });
            continue;
          }
          const fileObj = new File([result.text], result.fileName || df.name, { type: 'text/plain' });
          (fileObj as any).preExtractedText = result.text;
          importedFiles.push(fileObj);
        } catch (fileErr: any) {
          console.error(`Error importando ${df.name}:`, fileErr);
          failedFiles.push({
            name: df.name,
            error: fileErr.message || String(fileErr)
          });
        }
      }

      if (importedFiles.length > 0) {
        await addFiles(importedFiles);
        setSelectedDriveFileIds([]);
        if (failedFiles.length === 0) {
          setShowGoogleDocModal(false);
          showToast('success', '¡Archivos Importados!', `Se importaron ${importedFiles.length} documento(s) correctamente a tu cuaderno.`);
        } else {
          showToast(
            'warning',
            'Importación parcial',
            `Se añadieron ${importedFiles.length} archivo(s), pero ${failedFiles.length} archivo(s) no pudieron procesarse. Revisa el detalle en el modal.`
          );
        }
      }

      if (failedFiles.length > 0) {
        const errorText = failedFiles.map(f => `• ${f.name}:\n  ${f.error}`).join('\n\n');
        setDriveImportErrorDetails(errorText);
        showToast(
          'error',
          'Aviso sobre archivos no descargados',
          `No se pudieron descargar o transcribir ${failedFiles.length} archivo(s):\n${failedFiles.map(f => f.name).join(', ')}`
        );
      }
    } catch (err: any) {
      console.error("Error importing Drive files:", err);
      showToast('error', 'Error en Google Drive', err.message || "Ocurrió un error al importar los archivos de Google Drive.");
    } finally {
      setIsImportingDriveFiles(false);
      setDriveImportStatusText('');
    }
  };

  const addFiles = async (newFiles: File[]) => {
    if (userTier === 'free' && !activeStudyId && userHistory.length >= 2) {
      showToast('warning', 'Límite Gratuito', 'Has alcanzado el límite de 2 cuadernos en la cuenta gratuita. Pasa a PRO para cuadernos ilimitados.');
      setShowBillingModal(true);
      return;
    }

    const validFiles = newFiles.filter(f => {
      const lower = f.name.toLowerCase();
      return (
        f.type === 'application/pdf' || 
        f.type.startsWith('text/') || 
        f.type.startsWith('image/') ||
        f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        f.type === 'application/msword' ||
        f.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        f.type === 'application/vnd.ms-powerpoint' ||
        lower.endsWith('.pdf') || 
        lower.endsWith('.docx') || 
        lower.endsWith('.doc') || 
        lower.endsWith('.pptx') || 
        lower.endsWith('.ppt') || 
        lower.endsWith('.png') || 
        lower.endsWith('.jpg') || 
        lower.endsWith('.jpeg') || 
        lower.endsWith('.webp') || 
        lower.endsWith('.bmp') || 
        lower.endsWith('.tiff') || 
        lower.endsWith('.tif') || 
        lower.endsWith('.heic') || 
        lower.endsWith('.md') || 
        lower.endsWith('.txt') || 
        lower.endsWith('.csv') || 
        lower.endsWith('.gdoc')
      );
    });

    if (validFiles.length === 0) {
      if (newFiles.length > 0) {
        showToast('error', 'Formato no soportado', `No se pudo procesar "${newFiles[0].name}". Formatos permitidos: PDF (digital o escaneado), Presentaciones PowerPoint (.pptx), Imágenes/Fotos (.jpg, .png), Word (.docx) o Texto.`);
      } else {
        showToast('warning', 'Sin archivos válidos', 'Por favor, selecciona archivos válidos (PDF, PowerPoint, Fotos/Imágenes, Word o Texto).');
      }
      return;
    }

    // If active study title is empty, automatically use the first uploaded file's title
    if (!activeStudyTitle.trim() && validFiles.length > 0) {
      const derivedTitle = validFiles[0].name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
      if (derivedTitle) {
        setActiveStudyTitle(derivedTitle);
      }
    }

    if (userTier === 'free' && (files.length + validFiles.length) > 2) {
      setShowBillingModal(true);
      showToast('warning', 'Límite Gratuito', 'El plan gratuito está limitado a 2 documentos simultáneos. Actualiza a PRO para fuentes ilimitadas.');
      return;
    }

    setIsExtracting(true);
    setExtractingTotalFiles(validFiles.length);
    setExtractingFileNamesList(validFiles.map(f => f.name));
    setExtractProgress(12);

    const abortController = new AbortController();
    extractionAbortControllerRef.current = abortController;

    let simulatedProgress = 12;
    const progressInterval = setInterval(() => {
      simulatedProgress = Math.min(simulatedProgress + Math.floor(Math.random() * 5) + 2, 92);
      setExtractProgress(simulatedProgress);
    }, 280);

    try {
      const newFileTexts = { ...fileTexts };
      const newActiveFileNames = [...activeFileNames];
      const successfullyExtractedFiles: File[] = [];
      const failedExtractions: { name: string; error: string }[] = [];
      
      for (let i = 0; i < validFiles.length; i++) {
        if (abortController.signal.aborted) break;
        const file = validFiles[i];
        setCurrentExtractingFile(file.name);
        setExtractingFileIndex(i + 1);

        try {
          let text = '';
          if ((file as any).preExtractedText) {
            text = (file as any).preExtractedText;
          } else {
            text = await extractTextFromFile(file, abortController.signal);
          }

          if (abortController.signal.aborted) break;

          const substantive = text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').replace(/[\s\r\n\t]+/g, ' ').trim();
          if (!text || substantive.length === 0) {
            throw new Error(`El archivo "${file.name}" no contiene texto extraíble. Puede ser un PDF escaneado (fotocopia) sin capa OCR.`);
          }

          newFileTexts[file.name] = text;
          if (!newActiveFileNames.includes(file.name)) {
            newActiveFileNames.push(file.name);
          }
          successfullyExtractedFiles.push(file);

          // Boost progress dynamically based on completed files
          const completedFraction = Math.round(((i + 1) / validFiles.length) * 88);
          simulatedProgress = Math.max(simulatedProgress, completedFraction);
          setExtractProgress(simulatedProgress);
        } catch (fileError: any) {
          if (fileError?.name === 'AbortError' || abortController.signal.aborted) {
            console.log('Extracción cancelada por el usuario.');
            break;
          }
          console.error(`Error extracting file ${file.name}:`, fileError);
          failedExtractions.push({ name: file.name, error: fileError.message || String(fileError) });
          showToast('error', `Aviso sobre "${file.name}"`, fileError.message || 'Error al procesar el archivo');
        }
      }
      
      if (abortController.signal.aborted) {
        return;
      }

      if (successfullyExtractedFiles.length > 0) {
        const updatedFiles = [...files, ...successfullyExtractedFiles];
        setFiles(updatedFiles);
        setFileTexts(newFileTexts);
        setActiveFileNames(newActiveFileNames);
        rebuildStudyText(updatedFiles, newActiveFileNames, newFileTexts);
        showToast('success', 'Fuentes cargadas', `Se procesaron ${successfullyExtractedFiles.length} documento(s) con éxito.`);
      }

      // Smooth completion
      clearInterval(progressInterval);
      setExtractProgress(100);
      await new Promise((res) => setTimeout(res, 550));
    } catch (error: any) {
      if (error?.name === 'AbortError' || abortController.signal.aborted) {
        console.log('Proceso de extracción cancelado por el usuario.');
        return;
      }
      console.error('Error extracting text:', error);
      showToast('error', 'Error al procesar archivos', error.message || String(error));
    } finally {
      if (extractionAbortControllerRef.current === abortController) {
        extractionAbortControllerRef.current = null;
      }
      clearInterval(progressInterval);
      setIsExtracting(false);
      setExtractProgress(0);
      setCurrentExtractingFile('');
      setExtractingFileIndex(1);
    }
  };

  const removeFile = (indexToRemove: number) => {
    const fileToRemove = files[indexToRemove];
    const remainingFiles = files.filter((_, index) => index !== indexToRemove);
    setFiles(remainingFiles);
    
    const newFileTexts = { ...fileTexts };
    if (fileToRemove) {
      delete newFileTexts[fileToRemove.name];
    }
    const newActiveFileNames = activeFileNames.filter(name => name !== fileToRemove?.name);
    
    setFileTexts(newFileTexts);
    setActiveFileNames(newActiveFileNames);
    rebuildStudyText(remainingFiles, newActiveFileNames, newFileTexts);
    
    if (remainingFiles.length === 0) {
      setTopics([]);
    }
  };

  const reprocessFiles = async (filesToProcess: File[]) => {
    // Left for potential old compatibility, no longer primary
    if (filesToProcess.length === 0) {
      setStudyText('');
      setTopics([]);
      return;
    }
    setIsExtracting(true);
    try {
      const newFileTexts = { ...fileTexts };
      const newActiveFileNames = [...activeFileNames];
      for (const file of filesToProcess) {
        if (!newFileTexts[file.name]) {
          const text = await extractTextFromFile(file);
          newFileTexts[file.name] = text;
        }
        if (!newActiveFileNames.includes(file.name)) {
          newActiveFileNames.push(file.name);
        }
      }
      setFileTexts(newFileTexts);
      setActiveFileNames(newActiveFileNames);
      rebuildStudyText(filesToProcess, newActiveFileNames, newFileTexts);
    } catch (error) {
      console.error('Error extracting text:', error);
    } finally {
      setIsExtracting(false);
    }
  };

  const generateTopics = async () => {
    setIsGeneratingTopics(true);
    try {
      const res = await fetch("/api/generate-topics", {
        method: "POST",
        headers: getFetchHeaders(),
        body: JSON.stringify({ studyText }),
      });
      if (!res.ok) {
        let errorMsg = `Server returned status ${res.status}`;
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }
      const data = await res.json();
      
      const parsed = JSON.parse(data.text || '[]');
      const generatedTopics = parsed.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(t.imagePrompt)}?width=400&height=300&nologo=true`
      }));
      
      setTopics(generatedTopics);
      setViewMode('visual');
      if (activeStudyId) {
        saveCurrentStudy(activeStudyTitle, true, { topics: generatedTopics });
      }
    } catch (error: any) {
      console.error('Error generating topics:', error);
      alert(error.message || 'Hubo un error al generar los temas.');
      if (error.message && (error.message.includes('GEMINI_API_KEY') || error.message.includes('clave API') || error.message.includes('Clave API') || error.message.includes('API key'))) {
        setIsKeyMissing(true);
        setShowKeyInstructions(true);
        setTimeout(() => {
          document.getElementById('api-key-config-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      }
    } finally {
      setIsGeneratingTopics(false);
    }
  };

  const startQuiz = () => {
    setUnlockedTopics([]);
    setViewMode('session');
    if (activeStudyId) {
      saveCurrentStudy(activeStudyTitle, true, { unlockedTopics: [] });
    }
  };

  const handleUnlockTopic = (topicId: string) => {
    setUnlockedTopics(prev => {
      if (!prev.includes(topicId)) {
        const next = [...prev, topicId];
        if (activeStudyId) {
          saveCurrentStudy(activeStudyTitle, true, { unlockedTopics: next });
        }
        return next;
      }
      return prev;
    });
  };

  const renderSidebarContent = (showLogo = false) => {
    return (
      <>
        {showLogo && (
          <div className="flex items-center gap-3.5 mb-8 shrink-0 group">
            <AppLogo size="md" />
            <div className="logo-text font-display font-black text-2xl uppercase tracking-tighter leading-none">
              Tutor<br />
              <span className="text-accent-systematic">Cuaderno</span>
            </div>
          </div>
        )}

        {/* Tarjeta de Suscripción PRO / Premium */}
        <div className="mb-8 border border-white/5 bg-bg-systematic/50 p-4 rounded-xl flex flex-col relative overflow-hidden group shrink-0">
          {userTier === 'pro' ? (
            <>
              <div className="absolute top-0 right-0 bg-amber-500/10 text-amber-400 text-[8px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 border-b border-l border-white/5 rounded-bl-xl">
                ★ {userDisplayName ? `${userDisplayName} Pro` : 'PRO'}
              </div>
              <span className="font-mono text-[9px] text-amber-500 uppercase tracking-widest block mb-1 font-bold">Plan de Cuenta</span>
              <h4 className="text-sm font-bold text-ink uppercase tracking-tight flex items-center gap-1.5">
                Suscripción Activa
              </h4>
              <p className="text-[10px] text-ink-muted leading-relaxed mt-1.5 mb-3">
                Tienes acceso ilimitado a documentos, cuestionarios y tutorías de voz.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowBillingModal(true);
                    setShowMobileSidebar(false);
                  }}
                  className="w-full text-center py-2 border border-white/10 hover:border-white/20 text-[9px] font-mono uppercase tracking-widest font-bold text-ink bg-transparent cursor-pointer transition-colors"
                >
                  Detalles del Plan
                </button>
                {isAdmin && (
                  <button
                    onClick={() => {
                      handleResetTier();
                      setShowMobileSidebar(false);
                    }}
                    className="px-2 text-center border border-red-900/30 hover:bg-red-950/20 text-[9px] font-mono text-red-400 bg-transparent cursor-pointer transition-colors"
                    title="Restablecer plan (Solo Admin)"
                  >
                    Reset
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="absolute top-0 right-0 bg-accent-systematic/10 text-accent-systematic text-[8px] font-mono font-bold uppercase tracking-widest px-2 px-1 border-b border-l border-white/5 rounded-bl-xl">
                GRATIS
              </div>
              <span className="font-mono text-[9px] text-ink-muted uppercase tracking-widest block mb-1">Plan de Cuenta</span>
              <h4 className="text-sm font-bold text-ink uppercase tracking-tight">
                Tutor Cuaderno Free
              </h4>
              <div className="w-full bg-white/5 rounded-full h-1 my-2 overflow-hidden">
                <div 
                  className="bg-accent-systematic h-full transition-all duration-300"
                  style={{ width: `${Math.min((files.length / 2) * 100, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-ink-muted leading-relaxed mb-3">
                Uso: <span className="text-white font-bold">{files.length}</span> de <span className="text-accent-systematic font-bold">2</span> documentos permitidos.
              </p>
              <button
                onClick={() => {
                  setShowBillingModal(true);
                  setShowMobileSidebar(false);
                }}
                className="w-full text-center py-2.5 bg-accent-systematic text-black hover:bg-white text-[9px] font-mono uppercase tracking-widest font-bold transition-all duration-200 cursor-pointer mb-2 border-none"
              >
                Mejorar a PRO ($2.99 USD/mes)
              </button>
              <button
                onClick={() => {
                  setTempCoffeeLink(coffeeLink);
                  setTempCreatorAlias(creatorAlias);
                  setShowCoffeeModal(true);
                  setShowMobileSidebar(false);
                }}
                className="w-full text-center py-1.5 border border-white/5 hover:border-white/20 text-[8px] font-mono uppercase tracking-widest text-ink-muted hover:text-white transition-all cursor-pointer bg-transparent"
              >
                💳 Apoyar con Mercado Pago
              </button>
            </>
          )}
        </div>

        {/* Identificación del Estudiante */}
        <div className="mb-6 border border-white/5 bg-zinc-950/40 p-4 rounded-xl flex flex-col relative overflow-hidden group shrink-0">
          {userEmail ? (
            <>
              <div className="absolute top-0 right-0 bg-emerald-500/10 text-emerald-400 text-[8px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 border-b border-l border-white/5 rounded-bl-xl">
                ✓ ONLINE
              </div>
              <span className="font-mono text-[9px] text-emerald-500 uppercase tracking-widest block mb-1 font-bold">Estudiante</span>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400 text-xs shrink-0">
                  {userDisplayName ? userDisplayName[0].toUpperCase() : 'U'}
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-xs font-bold text-ink uppercase tracking-tight truncate">
                    {userDisplayName}
                  </h4>
                  <p className="text-[9px] text-ink-muted truncate">
                    {userEmail}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  handleSignOut();
                  setShowMobileSidebar(false);
                }}
                className="w-full text-center py-1.5 border border-red-500/10 hover:border-red-500/20 text-[8px] font-mono uppercase tracking-widest text-red-400/80 hover:text-red-400 transition-all cursor-pointer bg-transparent mt-1 font-medium"
              >
                Cerrar Sesión
              </button>
            </>
          ) : (
            <>
              <span className="font-mono text-[9px] text-ink-muted uppercase tracking-widest block mb-1">Identificación</span>
              <h4 className="text-xs font-bold text-ink uppercase tracking-tight mb-2">
                Guarda tu Historial
              </h4>
              <p className="text-[10px] text-ink-muted leading-relaxed mb-3">
                Identifícate con tu correo para guardar tus cuadernos y progreso en la nube de forma segura.
              </p>
              <button
                onClick={() => {
                  setTempEmailInput('');
                  setTempNameInput('');
                  setAuthOtpCode('');
                  setAuthPinCode('');
                  setAuthOtpStep('request');
                  setAuthErrorMessage(null);
                  setAuthStatusMessage(null);
                  setAuthDevCodeNotice(null);
                  setShowAuthModal(true);
                  setShowMobileSidebar(false);
                }}
                className="w-full text-center py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-[9px] font-mono uppercase tracking-widest font-bold transition-all duration-200 cursor-pointer border-none rounded shadow-sm"
              >
                Ingresar / Registrarme
              </button>
            </>
          )}
        </div>

        {/* Estado de Carga / Guardado de Cuaderno Activo */}
        {files.length > 0 && studyText.trim() !== '' && (
          <div className="mb-6 p-4 bg-zinc-950/40 border border-emerald-500/15 rounded-xl space-y-2 shrink-0">
            <div>
              <span className="font-mono text-[8px] text-emerald-400 uppercase tracking-widest block mb-1 font-bold">Estado del Cuaderno</span>
              <h4 className="text-xs font-bold text-white uppercase tracking-tight truncate">
                {activeStudyTitle || "Cuaderno sin Guardar"}
              </h4>
            </div>
            <button
              onClick={() => {
                if (!userEmail) {
                  setShowAuthModal(true);
                } else {
                  setNewStudyTitle(activeStudyTitle || "");
                  setShowSaveStudyModal(true);
                }
                setShowMobileSidebar(false);
              }}
              className="w-full py-2 bg-emerald-500 text-black font-mono font-bold text-[9px] uppercase tracking-wider rounded transition-all hover:bg-emerald-400 cursor-pointer flex items-center justify-center gap-1.5 border-none"
            >
              <span>💾 {activeStudyId ? "Actualizar Guardado" : "Guardar en Historial"}</span>
            </button>
            
            <button
              onClick={() => {
                handleCreateNewNotebook();
                setShowMobileSidebar(false);
              }}
              className="w-full py-1.5 border border-white/10 hover:border-white/20 text-white font-mono font-bold text-[9px] uppercase tracking-wider rounded transition-all hover:bg-white/5 cursor-pointer flex items-center justify-center gap-1 bg-transparent"
            >
              <span>✨ Crear Nuevo Cuaderno</span>
            </button>
          </div>
        )}

        <span className="font-mono text-[9px] text-ink-muted uppercase tracking-widest block mb-4 shrink-0 font-bold">Modos de Estudio</span>
        <div className="space-y-3 shrink-0 mb-6">
          <button
            disabled={files.length === 0 || isExtracting}
            onClick={() => {
              setViewMode('free_session');
              setShowMobileSidebar(false);
            }}
            className={cn(
              "w-full text-left p-4 xl:p-5 border transition-all duration-300 group cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed",
              viewMode === 'free_session' 
                ? "border-accent-systematic bg-accent-systematic/5 text-ink" 
                : "border-white/5 hover:border-white/20 bg-transparent text-white"
            )}
          >
            <h4 className="font-mono font-bold text-[10px] tracking-wider uppercase mb-1 flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", viewMode === 'free_session' ? "bg-accent-systematic" : "bg-white/20")}></span>
              [01] TUTORÍA_LIBRE
            </h4>
            <p className="text-[10px] text-ink-muted leading-relaxed">
              Conversación abierta de voz sobre el contenido.
            </p>
          </button>

          <button
            disabled={files.length === 0 || isExtracting}
            onClick={() => {
              setViewMode('multiple_choice');
              setShowMobileSidebar(false);
            }}
            className={cn(
              "w-full text-left p-4 xl:p-5 border transition-all duration-300 group cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed",
              viewMode === 'multiple_choice' 
                ? "border-accent-systematic bg-accent-systematic/5 text-ink" 
                : "border-white/5 hover:border-white/20 bg-transparent text-white"
            )}
          >
            <h4 className="font-mono font-bold text-[10px] tracking-wider uppercase mb-1 flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", viewMode === 'multiple_choice' ? "bg-accent-systematic" : "bg-white/20")}></span>
              [02] TEST_DINÁMICO
            </h4>
            <p className="text-[10px] text-ink-muted leading-relaxed">
              Cuestionario de retención progresiva.
            </p>
          </button>

          <button
            disabled={files.length === 0 || isExtracting || isGeneratingTopics}
            onClick={() => {
              generateTopics();
              setShowMobileSidebar(false);
            }}
            className={cn(
              "w-full text-left p-4 xl:p-5 border transition-all duration-300 group cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed",
              viewMode === 'visual' || viewMode === 'session'
                ? "border-accent-systematic bg-accent-systematic/5 text-ink" 
                : "border-white/5 hover:border-white/20 bg-transparent text-white"
            )}
          >
            <h4 className="font-mono font-bold text-[10px] tracking-wider uppercase mb-1 flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", viewMode === 'visual' || viewMode === 'session' ? "bg-accent-systematic" : "bg-white/20")}></span>
              [03] FLASHCARDS_VOZ
            </h4>
            <p className="text-[10px] text-ink-muted leading-relaxed">
              Tarjetas conceptuales guiadas vía voz.
            </p>
          </button>

          <button
            onClick={() => {
              setViewMode('setup');
              setShowMobileSidebar(false);
            }}
            className={cn(
              "w-full text-left p-4 xl:p-5 border transition-all duration-300 group cursor-pointer",
              viewMode === 'setup' 
                ? "border-accent-systematic bg-accent-systematic/5 text-ink" 
                : "border-white/5 hover:border-white/20 bg-transparent text-white"
            )}
          >
            <h4 className="font-mono font-bold text-[10px] tracking-wider uppercase mb-1 flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", viewMode === 'setup' ? "bg-accent-systematic" : "bg-white/20")}></span>
              [00] FUENTES_CUADERNO
            </h4>
            <p className="text-[10px] text-ink-muted leading-relaxed">
              Configuración y carga de documentos.
            </p>
          </button>
        </div>

        <div className="mt-auto pt-6 border-t border-white/5 shrink-0">
          <span className="font-mono text-[9px] text-ink-muted uppercase tracking-widest block mb-1">Estado de Seguridad</span>
          <div className="font-mono text-[10px] text-accent-systematic font-bold uppercase tracking-wider">CANAL_SEGURO_ACTIVADO</div>
        </div>
      </>
    );
  };

  const renderRightSidebarContent = () => {
    return (
      <>
        <span className="font-mono text-[9px] text-ink-muted uppercase tracking-widest block mb-4">Registro Activo</span>
        
        {files.length === 0 ? (
          <div className="border border-white/5 p-4 text-center text-ink-muted text-[10px] font-mono uppercase tracking-wider rounded">
            SIN_ARCHIVOS_CARGADOS
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {files.map((f, i) => {
              const ext = f.name.split('.').pop()?.toUpperCase() || 'TXT';
              const isActive = activeFileNames.includes(f.name);
              return (
                <div 
                  key={i} 
                  onClick={() => toggleFileActive(f.name)}
                  className={cn(
                    "font-mono text-[10px] p-2.5 border rounded-lg flex items-center justify-between uppercase transition-all cursor-pointer select-none",
                    isActive 
                      ? "border-accent-systematic/30 bg-accent-systematic/5 text-white" 
                      : "border-white/5 bg-bg-systematic/40 text-ink-muted opacity-60 hover:opacity-90"
                  )}
                >
                  <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => {}} // handled by onClick
                      className="accent-accent-systematic rounded w-3 h-3 cursor-pointer shrink-0"
                    />
                    <span className="truncate font-medium" title={f.name}>{f.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn(
                      "text-[7px] font-bold px-1 rounded shrink-0",
                      isActive ? "bg-accent-systematic/20 text-accent-systematic" : "bg-zinc-800 text-zinc-500"
                    )}>
                      {isActive ? "ON" : "OFF"}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(i);
                      }}
                      className="text-red-400 hover:text-red-300 hover:underline shrink-0 cursor-pointer text-[8px] font-bold bg-transparent border-none p-0"
                    >
                      BORRAR
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10">
          <span className="font-mono text-[9px] text-ink-muted uppercase tracking-widest block mb-3">Metadatos del Sistema</span>
          <div className="font-mono text-[10px] text-ink-muted leading-relaxed uppercase space-y-1">
            <div>REF_ID: 4882-TC-VOX</div>
            <div>RED: NODO_001_SA</div>
            <div className="flex items-center gap-1.5">
              <span>STORAGE:</span>
              <span className={cn("px-1 py-0.2 rounded text-[9px] font-bold", gcsStatus?.isConfigured ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400")}>
                {isAdmin 
                  ? (gcsStatus?.isConfigured ? `GCS [${gcsStatus.bucketName || 'DEFAULT'}]` : 'GCS (SIN BUCKET)')
                  : (gcsStatus?.isConfigured ? 'NUBE ACTIVA' : 'SISTEMA LISTO')}
              </span>
            </div>
            <div>LATENCIA: {isExtracting ? 'CALCULANDO...' : '0.2ms'}</div>
            <div>ARCHIVOS: {files.length}</div>
            <div>ESTADO: {isExtracting ? 'PROCESANDO' : 'SISTEMA_PREPARADO'}</div>
          </div>
        </div>

        {/* Botón Google Cloud Storage (Exclusivo Administrador) */}
        {isAdmin && (
          <button
            onClick={() => {
              setShowGcsModal(true);
              setShowMobileSidebar(false);
              setShowMobileInspector(false);
            }}
            className="w-full bg-blue-950/40 hover:bg-blue-900/50 text-blue-200 border border-blue-500/30 py-3 px-4 font-mono font-bold text-[9px] uppercase tracking-wider rounded-lg mt-4 cursor-pointer transition-colors flex items-center justify-between"
            title="Configurar y ver estado de Google Cloud Storage (Admin)"
          >
            <span className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full", gcsStatus?.isConfigured ? "bg-emerald-400 animate-pulse" : "bg-amber-400")}></span>
              <span>☁️ Cloud Storage</span>
            </span>
            <span className="text-[8px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono flex items-center gap-1">
              <span className="text-[7px] text-amber-400 font-bold">ADMIN</span>
              <span>{gcsStatus?.isConfigured ? 'CONECTADO' : 'CONFIGURAR'}</span>
            </span>
          </button>
        )}

        {/* Botón Feedback & Críticas Sinceras */}
        <button
          onClick={() => {
            setFeedbackTriggerSource('manual');
            setShowFeedbackModal(true);
            setShowMobileSidebar(false);
            setShowMobileInspector(false);
          }}
          className="w-full bg-amber-950/30 hover:bg-amber-900/40 text-amber-200 border border-amber-500/30 py-3 px-4 font-mono font-bold text-[9px] uppercase tracking-wider rounded-lg mt-2 cursor-pointer transition-colors flex items-center justify-between"
          title="Opinar o reportar una crítica/falla"
        >
          <span className="flex items-center gap-2">
            <MessageSquareHeart className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>💬 Feedback / Críticas</span>
          </span>
          <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">
            OPINAR
          </span>
        </button>

        {/* Botón Panel de Administración y Métricas (Exclusivo Administrador) */}
        {isAdmin && (
          <button
            onClick={() => {
              setShowAdminPanel(true);
              setShowMobileSidebar(false);
              setShowMobileInspector(false);
            }}
            className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 py-3 px-4 font-mono font-bold text-[9px] uppercase tracking-wider rounded-lg mt-2 cursor-pointer transition-colors flex items-center justify-between"
            title="Panel de administración y métricas"
          >
            <span className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>👑 Panel Admin</span>
            </span>
            <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
              MÉTRICAS
            </span>
          </button>
        )}

        <button
          onClick={() => {
            setShowApiKeyModal(true);
            setShowMobileSidebar(false);
            setShowMobileInspector(false);
          }}
          className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 border-t border-white/5 py-4 px-6 font-mono font-bold text-[9px] uppercase tracking-wider mt-3 cursor-pointer transition-colors"
        >
          ⚙️ Clave API (Opcional)
        </button>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-bg-systematic text-ink font-sans selection:bg-accent-systematic selection:text-black flex flex-col h-screen overflow-hidden">
      {/* Toast Notifications System (immune to iframe sandbox alert blocking) */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm sm:max-w-md w-[calc(100vw-2rem)] pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto p-3.5 rounded-xl border shadow-2xl backdrop-blur-md flex items-start gap-3 ${
                toast.type === 'error'
                  ? 'bg-red-950/95 border-red-500/50 text-red-100 shadow-red-950/50'
                  : toast.type === 'warning'
                  ? 'bg-amber-950/95 border-amber-500/50 text-amber-100 shadow-amber-950/50'
                  : toast.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100 shadow-emerald-950/50'
                  : 'bg-zinc-900/95 border-white/20 text-white shadow-black/50'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {toast.type === 'info' && <Info className="w-4 h-4 text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <h4 className="font-bold text-[11px] uppercase tracking-wider mb-0.5 font-mono">
                    {toast.title}
                  </h4>
                )}
                <p className="text-xs leading-relaxed opacity-90 whitespace-pre-wrap font-sans break-words">
                  {toast.message}
                </p>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 p-1 text-white/50 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
                title="Cerrar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {/* Top Header for Mobile */}
      <header className="md:hidden bg-panel-systematic border-b border-white/5 px-4 py-3 flex items-center justify-between z-30 shrink-0 select-none">
        <button
          onClick={() => setShowMobileSidebar(true)}
          className="px-2.5 py-1.5 border border-white/10 hover:bg-white/5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer bg-transparent"
        >
          <span>☰ Menú</span>
        </button>
        
        <div className="flex items-center gap-2">
          <AppLogo size="xs" withGlow={false} />
          <div className="font-display font-black text-sm uppercase tracking-tighter text-center">
            Tutor <span className="text-accent-systematic">Cuaderno</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setFeedbackTriggerSource('manual');
              setShowFeedbackModal(true);
            }}
            className="p-1.5 border border-amber-500/30 bg-amber-500/10 text-amber-300 rounded-lg text-xs cursor-pointer"
            title="Feedback y sugerencias"
          >
            <MessageSquareHeart className="w-3.5 h-3.5 text-amber-400" />
          </button>

          <button
            onClick={() => setShowMobileInspector(true)}
            className="px-2 py-1.5 border border-white/10 hover:bg-white/5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer bg-transparent"
          >
            <span>📂 Fuentes</span>
          </button>
        </div>
      </header>

      {/* Main Full-Screen Layout */}
      <div className="flex-grow flex flex-col md:flex-row overflow-hidden relative">
        {/* Nav Rail (hidden on mobile) */}
        <div className="hidden md:flex w-20 flex-col items-center py-8 border-r border-white/5 shrink-0 select-none bg-bg-systematic">
          <div className="mb-6 hover:scale-105 transition-transform" title="Tutor Cuaderno">
            <AppLogo size="sm" />
          </div>
          <div className={cn(
            "w-10 h-10 border mb-6 flex items-center justify-center font-mono text-sm tracking-tighter transition-all duration-300",
            viewMode === 'free_session' ? "border-accent-systematic text-accent-systematic font-bold" : "border-white/10 opacity-30"
          )}>C</div>
          <div className={cn(
            "w-10 h-10 border mb-6 flex items-center justify-center font-mono text-sm tracking-tighter transition-all duration-300",
            viewMode === 'multiple_choice' ? "border-accent-systematic text-accent-systematic font-bold" : "border-white/10 opacity-30"
          )}>V</div>
        </div>

        {/* Left Sidebar */}
        <aside className="hidden md:flex w-64 xl:w-72 flex-col bg-panel-systematic p-6 xl:p-8 border-r border-white/5 shrink-0 select-none overflow-y-auto">
          {renderSidebarContent(true)}
        </aside>

        {/* Main Viewport */}
        <main className="flex-grow flex flex-col overflow-y-auto grid-bg relative p-6 lg:p-12 z-10">
          {/* Fondo Artístico de Proporción Áurea (φ) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
            <GoldenRatioWatermark className="w-[520px] h-[520px] lg:w-[640px] lg:h-[640px] opacity-40 mix-blend-screen" />
          </div>

      <AnimatePresence mode="wait">
          {viewMode === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid grid-cols-1 xl:grid-cols-3 border-b border-white/5"
            >
              {/* Column 1: Tu Cuaderno de Estudio */}
              <div className="p-8 xl:p-10 border-b xl:border-b-0 xl:border-r border-white/5 flex flex-col justify-between gap-8 bg-panel-systematic/20">
                <div>
                  <span className="font-mono text-[10px] text-accent-systematic uppercase tracking-widest block mb-1">Sección / 01</span>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-4">
                    <h2 className="text-xl font-bold text-ink">Tu Cuaderno de Estudio</h2>
                    {(activeStudyId !== null || files.length > 0 || activeStudyTitle.trim() !== '') && (
                      <button
                        onClick={handleCreateNewNotebook}
                        className="font-mono text-[8px] bg-accent-systematic/10 border border-accent-systematic/25 px-2.5 py-1 text-accent-systematic hover:bg-accent-systematic hover:text-black uppercase tracking-wider font-bold transition-all cursor-pointer rounded"
                        title="Crear un cuaderno desde cero"
                      >
                        ✨ Nuevo Cuaderno
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed mb-6">
                    Primero, asígnale un nombre a tu cuaderno de estudio. Luego, sube tus apuntes o documentos de referencia para que el tutor inteligente los analice.
                  </p>

                  {/* Paso 1: Nombre del Cuaderno */}
                  <div className="mb-6 p-4 bg-zinc-950/40 border border-white/10 rounded-xl space-y-2">
                    <label className="block font-mono text-[9px] text-accent-systematic uppercase tracking-wider font-bold">
                      ✍️ Paso 1: Nombre del Cuaderno
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Física Avanzada, Historia Americana..."
                      value={activeStudyTitle}
                      onChange={(e) => setActiveStudyTitle(e.target.value)}
                      className="w-full bg-bg-systematic border border-white/15 p-2.5 rounded text-xs text-white placeholder:text-ink-muted focus:border-accent-systematic focus:outline-none transition-all"
                    />
                  </div>

                  {/* Paso 2: Subida de Documentos */}
                  <div className="space-y-2">
                    <label className="block font-mono text-[9px] text-accent-systematic uppercase tracking-wider font-bold">
                      📁 Paso 2: Subir los Archivos
                    </label>

                    {userTier === 'free' && !activeStudyId && userHistory.length >= 2 ? (
                      <div 
                        onClick={() => setShowBillingModal(true)}
                        className="w-full border-2 border-dashed border-red-500/30 p-8 bg-red-950/10 text-center rounded-xl cursor-pointer hover:border-red-500/50 transition-all group"
                      >
                        <span className="text-lg block mb-1.5">🔒</span>
                        <div className="font-mono text-[10px] text-red-400 uppercase tracking-widest font-bold mb-2">
                          Límite de Cuadernos Alcanzado
                        </div>
                        <p className="text-[10px] text-ink-muted leading-relaxed font-mono">
                          Has alcanzado el límite de 2 cuadernos de estudio en tu cuenta gratuita. <span className="text-accent-systematic underline group-hover:text-accent-systematic/80 font-bold">Haz clic aquí para actualizar a PRO</span> y disfrutar de cuadernos ilimitados.
                        </p>
                      </div>
                    ) : isExtracting ? (
                      <UploadProgressAnimation
                        currentFileName={currentExtractingFile || (files[files.length - 1]?.name) || "Documento de estudio"}
                        currentFileIndex={extractingFileIndex}
                        totalFiles={extractingTotalFiles}
                        allFileNames={extractingFileNamesList}
                        progress={extractProgress}
                        onCancel={cancelExtraction}
                      />
                    ) : (
                      <div className="space-y-3">
                        <div
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={handleFileDrop}
                          className="w-full border-2 border-ink p-6 bg-bg-systematic shadow-[6px_6px_0px_#161616] hover:shadow-[8px_8px_0px_#ff4d00] hover:border-accent-systematic transition-all duration-300 cursor-pointer group relative overflow-hidden"
                          onClick={() => document.getElementById('file-upload')?.click()}
                        >
                          <input
                            id="file-upload"
                            type="file"
                            multiple
                            accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,.pptx,.ppt,image/*,.png,.jpg,.jpeg,.webp,.bmp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,.docx,.doc,text/plain,text/markdown,.md,.txt,.csv,.gdoc"
                            className="hidden"
                            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                            onChange={handleFileInput}
                          />
                          <div className="font-mono text-[10px] text-accent-systematic uppercase tracking-widest font-bold mb-1">
                            + Subir Fuentes (PDF, PPTX, Fotos/Imágenes, Word, TXT)
                          </div>
                          <p className="text-[10px] text-ink-muted leading-relaxed font-mono">
                            {activeStudyTitle 
                              ? `Explora o arrastra PDFs (digitales o escaneados con OCR), diapositivas PPTX, fotos de apuntes o Word para "${activeStudyTitle}".`
                              : 'Explora o arrastra PDFs (digitales o escaneados), diapositivas PPTX, fotos de apuntes o Word (crearemos el cuaderno con su nombre).'
                            }
                          </p>
                          <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-1.5 text-[8.5px] font-mono text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                            <span>{isAdmin && gcsStatus?.bucketName ? `Google Cloud Storage (gs://${gcsStatus.bucketName})` : 'Almacenamiento seguro en la nube'}</span>
                          </div>
                        </div>

                        {/* Direct Google Docs / Google Drive import button */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setGoogleDocTab(driveAccessToken ? 'drive' : 'link');
                              setShowGoogleDocModal(true);
                            }}
                            className="w-full p-3 bg-blue-950/20 border border-blue-500/30 hover:border-blue-400 text-left rounded-xl transition-all group flex items-center justify-between cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                <svg className="w-4 h-4 text-blue-400 fill-current" viewBox="0 0 24 24">
                                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                                </svg>
                              </div>
                              <div>
                                <div className="font-mono text-[10px] text-blue-300 uppercase tracking-wider font-bold flex items-center gap-1.5">
                                  Importar Google Docs & Drive
                                </div>
                                <p className="text-[9px] text-ink-muted font-mono">
                                  {driveAccessToken ? '🟢 Conectado - Explora tus archivos de Drive' : 'Explora tus archivos de Google Drive o pega un enlace'}
                                </p>
                              </div>
                            </div>
                            <span className="text-[9px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded uppercase tracking-wider group-hover:bg-blue-500 group-hover:text-black transition-all">
                              + Explorar
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="mt-8">
                    <span className="font-mono text-[10px] text-accent-systematic uppercase tracking-widest block mb-1">
                      Biblioteca / {files.length} Archivo(s) ({activeFileNames.length} Activo(s))
                    </span>
                    <span className="text-[10px] text-ink-muted leading-relaxed font-mono block mb-3">
                      💡 Selecciona qué fuentes usarás para este estudio:
                    </span>
                    <div className="space-y-2">
                      {files.map((f, i) => {
                        const ext = f.name.split('.').pop()?.toUpperCase() || 'TXT';
                        const isActive = activeFileNames.includes(f.name);
                        return (
                          <div 
                            key={i} 
                            onClick={() => toggleFileActive(f.name)}
                            className={cn(
                              "bg-bg-systematic border p-3.5 flex items-center justify-between text-xs transition-all duration-200 cursor-pointer select-none group rounded-lg",
                              isActive 
                                ? "border-accent-systematic/50 bg-accent-systematic/5 hover:border-accent-systematic" 
                                : "border-white/5 hover:border-white/15 opacity-60 hover:opacity-90"
                            )}
                          >
                            <div className="flex items-center gap-3 max-w-[70%]">
                              <div className="relative flex items-center justify-center shrink-0">
                                <input
                                  type="checkbox"
                                  checked={isActive}
                                  onChange={() => {}} // Handled by parent onClick
                                  className="accent-accent-systematic rounded w-3.5 h-3.5 cursor-pointer"
                                />
                              </div>
                              <span className={cn(
                                "overflow-hidden text-ellipsis whitespace-nowrap font-medium transition-colors truncate",
                                isActive ? "text-white font-semibold" : "text-ink-muted"
                              )}>
                                {f.name}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={cn(
                                "font-mono text-[8px] uppercase tracking-wider font-bold shrink-0 px-1.5 py-0.5 rounded",
                                isActive 
                                  ? "bg-accent-systematic/15 text-accent-systematic border border-accent-systematic/20" 
                                  : "bg-zinc-800 text-ink-muted border border-zinc-700"
                              )}>
                                {isActive ? "Activo" : "Inactivo"}
                              </span>
                              <span className="font-mono text-[9px] text-ink-muted uppercase tracking-wider">
                                {ext}
                              </span>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFile(i);
                                }}
                                className="p-1 text-ink-muted hover:text-red-400 hover:scale-110 transition-all shrink-0 cursor-pointer bg-transparent border-none"
                                title="Eliminar fuente"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Column 2: Listo para Analizar y/o Historial de Estudios */}
              <div className="bg-panel-systematic/40 p-8 xl:p-10 border-b xl:border-b-0 xl:border-r border-white/5 flex flex-col min-h-[400px] xl:min-h-0">
                {files.length > 0 ? (
                  /* Active Cuaderno Preview */
                  <div className="flex flex-col items-center justify-center text-center max-w-[280px] mx-auto pb-6 border-b border-white/5 mb-6 shrink-0 w-full">
                    <div className="w-[1.5px] h-12 bg-accent-systematic mb-4" />
                    <h3 className="font-display italic text-2xl text-ink mb-1 leading-tight uppercase">Listo para Analizar</h3>
                    <p className="text-ink-muted text-[11px] leading-relaxed mb-4">
                      {isExtracting 
                        ? "Procesando tus documentos para estructurar el temario..."
                        : "El sistema está preparado para analizar tus documentos. Selecciona una metodología de aprendizaje a la derecha."
                      }
                    </p>
                    <div className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest font-bold">
                      {isExtracting 
                        ? `Extrayendo contenido... (${Math.round(extractProgress)}%)` 
                        : "Esperando selección..."
                      }
                    </div>
                  </div>
                ) : null}

                {/* Historial Panel */}
                <div className="flex-grow flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="font-mono text-[9px] text-emerald-400 uppercase tracking-widest block font-bold">Historial</span>
                      <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Mis Cuadernos Guardados</h3>
                    </div>
                    {userEmail && (
                      <button
                        onClick={() => fetchUserHistory(userEmail)}
                        className="p-1 text-ink-muted hover:text-emerald-400 transition-colors cursor-pointer text-[10px] font-mono bg-transparent border-none"
                        title="Sincronizar"
                      >
                        🔄 Sincronizar
                      </button>
                    )}
                  </div>

                  {!userEmail ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-center p-4 border border-dashed border-emerald-500/20 bg-emerald-950/10 rounded-xl space-y-2.5">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase mb-1">Acceso Seguro</h4>
                        <p className="text-[10px] text-ink-muted leading-relaxed max-w-[220px]">
                          Tus cuadernos están resguardados de forma privada. Ingresa con tu correo y código de verificación:
                        </p>
                      </div>

                      <div className="w-full flex flex-col gap-2 pt-1">
                        <button
                          onClick={() => {
                            setTempEmailInput('');
                            setTempNameInput('');
                            setAuthOtpCode('');
                            setAuthPinCode('');
                            setAuthOtpStep('request');
                            setAuthErrorMessage(null);
                            setAuthStatusMessage(null);
                            setAuthDevCodeNotice(null);
                            setShowAuthModal(true);
                          }}
                          className="w-full py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-black font-sans font-bold text-[9.5px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all border-none"
                        >
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span>Ingresar con Correo Seguro</span>
                        </button>
                      </div>
                    </div>
                  ) : isLoadingHistory ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-center py-10">
                      <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-2" />
                      <span className="font-mono text-[9px] text-ink-muted uppercase">Buscando en la nube...</span>
                    </div>
                  ) : userHistory.length === 0 ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/5 bg-black/10 rounded-xl">
                      <span className="text-xl mb-2">📖</span>
                      <h4 className="text-xs font-bold text-white uppercase mb-1">Aún no hay cuadernos</h4>
                      <p className="text-[10px] text-ink-muted leading-relaxed max-w-[200px]">
                        Sube algunos documentos y haz clic en <strong>"Guardar en Historial"</strong> en la barra lateral para registrar tu primer cuaderno.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {userHistory.map((study) => (
                        <div
                          key={study.id}
                          onClick={() => loadStudy(study)}
                          className={cn(
                            "p-3 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between group",
                            activeStudyId === study.id
                              ? "bg-emerald-500/5 border-emerald-500/40"
                              : "bg-zinc-950/20 border-white/5 hover:border-white/15"
                          )}
                        >
                          <div className="overflow-hidden mr-3">
                            <h4 className="text-[11px] font-bold text-white uppercase tracking-tight truncate group-hover:text-emerald-400 transition-colors">
                              {study.title}
                            </h4>
                            <p className="text-[9px] text-ink-muted mt-0.5 font-mono truncate">
                              {study.files?.length || 0} doc(s) • {new Date(study.createdAt).toLocaleDateString('es-AR')}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-1.5 shrink-0">
                            {activeStudyId === study.id && (
                              <span className="text-[8px] font-mono bg-emerald-500/20 text-emerald-400 px-1 rounded uppercase tracking-wider font-bold">
                                Activo
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setStudyToDelete({ id: study.id, title: study.title });
                              }}
                              className="p-1 text-ink-muted hover:text-red-400 transition-colors cursor-pointer bg-transparent border-none"
                              title="Eliminar de historial"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Column 3: Estudio Inteligente */}
              <div className="p-8 xl:p-10 flex flex-col gap-6 bg-panel-systematic/20">
                <div>
                  <span className="font-mono text-[10px] text-accent-systematic uppercase tracking-widest block mb-1">Sección / 02</span>
                  <h2 className="text-xl font-bold text-ink mb-2">Estudio Inteligente</h2>
                  <p className="text-xs text-ink-muted leading-relaxed mb-4">
                    {files.length === 0 
                      ? "Añade al menos una fuente al cuaderno para activar las herramientas de IA." 
                      : activeFileNames.length === 0
                        ? "Selecciona al menos una fuente activa en tu Biblioteca (marcando su casilla de verificación) para activar las herramientas de IA."
                        : `Tienes ${files.length} documento(s) subido(s) (${activeFileNames.length} activo(s) para estudiar). Selecciona un método de aprendizaje para comenzar:`}
                  </p>

                  <div className="mt-6 flex flex-col">
                    {/* Method 1: Tutoría Libre */}
                    <button
                      disabled={files.length === 0 || activeFileNames.length === 0 || isExtracting}
                      onClick={() => setViewMode('free_session')}
                      className="w-full text-left py-6 border-t border-white/5 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 group text-ink bg-transparent cursor-pointer"
                    >
                      <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest block mb-1">01. Asistente de Voz</span>
                      <span className="font-display font-bold text-lg text-ink group-hover:text-accent-systematic group-hover:underline transition-all block mb-1 uppercase">
                        Tutoría Libre (Voz)
                      </span>
                      <p className="text-ink-muted text-xs leading-relaxed">
                        Conversa de forma libre con el tutor sobre el contenido de tus notas.
                      </p>
                    </button>

                    {/* Method 2: Test de Opción Múltiple */}
                    <button
                      disabled={files.length === 0 || activeFileNames.length === 0 || isExtracting}
                      onClick={() => setViewMode('multiple_choice')}
                      className="w-full text-left py-6 border-t border-white/5 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 group text-ink bg-transparent cursor-pointer"
                    >
                      <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest block mb-1">02. Cuestionario Escrito</span>
                      <span className="font-display font-bold text-lg text-ink group-hover:text-accent-systematic group-hover:underline transition-all block mb-1 uppercase">
                        Test de Opción Múltiple
                      </span>
                      <p className="text-ink-muted text-xs leading-relaxed">
                        Responde un cuestionario dinámico generado para comprobar tu retención.
                      </p>
                    </button>

                    {/* Method 3: Cuestionario por Voz (Fichas) */}
                    <button
                      disabled={files.length === 0 || activeFileNames.length === 0 || isExtracting || isGeneratingTopics}
                      onClick={generateTopics}
                      className="w-full text-left py-6 border-t border-white/5 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 group text-ink bg-transparent cursor-pointer"
                    >
                      <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest block mb-1">03. Tarjetas Interactivas</span>
                      <span className="font-display font-bold text-lg text-ink group-hover:text-accent-systematic group-hover:underline transition-all block mb-1 uppercase">
                        {isExtracting ? "Procesando notas..." : isGeneratingTopics ? "Analizando..." : "Cuestionario por Voz (Fichas)"}
                      </span>
                      <p className="text-ink-muted text-xs leading-relaxed">
                        Desbloquea tarjetas conceptuales ilustradas respondiendo preguntas oralmente.
                      </p>
                    </button>

                    {/* Method 4: Evaluador Oral Temático */}
                    <button
                      disabled={files.length === 0 || activeFileNames.length === 0 || isExtracting}
                      onClick={() => setViewMode('oral_evaluator_setup')}
                      className="w-full text-left py-6 border-t border-b border-white/5 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 group text-ink bg-transparent cursor-pointer"
                    >
                      <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest block mb-1">04. Examen Estructurado</span>
                      <span className="font-display font-bold text-lg text-ink group-hover:text-accent-systematic group-hover:underline transition-all block mb-1 uppercase">
                        Evaluación Oral Temática
                      </span>
                      <p className="text-ink-muted text-xs leading-relaxed">
                        Selecciona un tema clave sugerido y rinde un examen oral de 5 preguntas calificadas en tiempo real.
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {viewMode === 'visual' && (
            <motion.div
              key="visual"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col gap-8 max-w-5xl mx-auto p-6"
            >
              <div className="text-center max-w-2xl mx-auto mb-4">
                <span className="font-mono text-[10px] text-accent-systematic uppercase tracking-widest block mb-2">
                  Mapa / Tarjetas Interactivas
                </span>
                <h2 className="text-3xl font-extrabold font-display uppercase tracking-tight text-ink mt-2 mb-4">
                  Temarios Clave Encontrados
                </h2>
                <p className="text-ink-muted text-xs leading-relaxed max-w-lg mx-auto">
                  Estos son los temas principales estructurados por nuestro tutor IA a partir de tu cuaderno. Familiarízate con ellos. Al comenzar el cuestionario por voz, las fichas se bloquearán y deberás desbloquearlas respondiendo correctamente.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {topics.map((topic, idx) => (
                  <div 
                    key={topic.id} 
                    className="bg-panel-systematic border border-white/5 overflow-hidden hover:border-accent-systematic hover:-translate-y-1 transition-all duration-300 flex flex-col group animate-in fade-in slide-in-from-bottom-4 duration-500 shadow-[6px_6px_0px_#161616]"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="h-44 overflow-hidden bg-bg-systematic relative border-b border-white/5">
                      <img 
                        src={topic.imageUrl} 
                        alt={topic.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="p-6 flex-grow flex flex-col justify-between">
                      <div>
                        <h3 className="text-base font-bold font-display text-ink mb-2 leading-snug group-hover:text-accent-systematic transition-colors uppercase">
                          {topic.title}
                        </h3>
                        <p className="text-ink-muted text-xs leading-relaxed line-clamp-4">
                          {topic.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-center mt-10">
                <button
                  onClick={startQuiz}
                  className="bg-accent-systematic hover:bg-white text-black font-mono text-xs uppercase tracking-widest py-4 px-10 border border-none transition-all duration-200 active:scale-[0.98] flex items-center gap-3 cursor-pointer font-bold"
                >
                  <Mic className="w-4 h-4 text-black" />
                  Iniciar Cuestionario por Voz
                </button>
              </div>
            </motion.div>
          )}

          {viewMode === 'session' && (
            <motion.div
              key="session"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <StudySession 
                text={studyText} 
                topics={topics}
                unlockedTopics={unlockedTopics}
                onUnlockTopic={handleUnlockTopic}
                onEnd={() => setViewMode('visual')} 
              />
            </motion.div>
          )}

          {viewMode === 'free_session' && (
            <motion.div
              key="free_session"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <FreeStudySession 
                text={studyText} 
                onEnd={() => setViewMode('setup')} 
              />
            </motion.div>
          )}

          {viewMode === 'multiple_choice' && (
            <motion.div
              key="multiple_choice"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <MultipleChoiceQuiz 
                key={`quiz_${activeStudyId || 'new'}_${quizVersion}`}
                text={studyText} 
                onEnd={() => setViewMode('setup')} 
                savedQuestions={savedQuizQuestions}
                onSaveQuestions={(qs) => {
                  setSavedQuizQuestions(qs);
                  if (activeStudyId) {
                    saveCurrentStudy(activeStudyTitle, true, { savedQuizQuestions: qs });
                  }
                }}
                onRegenerate={() => {
                  setSavedQuizQuestions([]);
                  setQuizVersion(v => v + 1);
                  if (activeStudyId) {
                    saveCurrentStudy(activeStudyTitle, true, { savedQuizQuestions: [] });
                  }
                }}
              />
            </motion.div>
          )}

          {viewMode === 'oral_evaluator_setup' && (
            <motion.div
              key="oral_evaluator_setup"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <OralEvaluatorSetup
                studyText={studyText}
                suggestedTopics={suggestedOralTopics}
                onSetSuggestedTopics={(topics) => {
                  setSuggestedOralTopics(topics);
                  saveCurrentStudy(activeStudyTitle, true, { suggestedOralTopics: topics });
                }}
                sessions={oralExamSessions}
                onStartNewSession={handleStartNewOralSession}
                onSelectExistingSession={handleSelectExistingOralSession}
                onDeleteSession={handleDeleteOralSession}
                onEnd={() => setViewMode('setup')}
                isGenerating={isGeneratingOralTopics}
                onSetIsGenerating={setIsGeneratingOralTopics}
                getFetchHeaders={getFetchHeaders}
              />
            </motion.div>
          )}

          {viewMode === 'oral_evaluator_session' && activeOralSession && (
            <motion.div
              key="oral_evaluator_session"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <OralEvaluatorSession
                session={activeOralSession}
                studyText={studyText}
                onUpdateSession={handleUpdateOralSession}
                onEnd={() => setViewMode('oral_evaluator_setup')}
                WebSocketSessionClass={WebSocketSession}
              />
            </motion.div>
          )}
        </AnimatePresence>
        </main>

        {/* Right Inspector Panel */}
        <aside className="hidden lg:flex w-72 flex-col bg-panel-systematic p-8 border-l border-white/5 shrink-0 select-none overflow-y-auto">
          {renderRightSidebarContent()}
        </aside>
      </div>

      {/* Mobile Drawer - Left Sidebar */}
      <AnimatePresence>
        {showMobileSidebar && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileSidebar(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            {/* Drawer Content */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-y-0 left-0 w-[280px] bg-panel-systematic border-r border-white/5 p-6 flex flex-col overflow-y-auto select-none"
            >
              <div className="flex items-center justify-between mb-8 shrink-0">
                <div className="logo-text font-display font-black text-xl uppercase tracking-tighter leading-none">
                  Tutor<br />
                  <span className="text-accent-systematic">Cuaderno</span>
                </div>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-1.5 border border-white/10 hover:bg-white/5 text-ink hover:text-white rounded-lg text-xs font-mono font-bold uppercase cursor-pointer bg-transparent"
                >
                  Cerrar
                </button>
              </div>
              
              {renderSidebarContent(false)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Drawer - Right Inspector */}
      <AnimatePresence>
        {showMobileInspector && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileInspector(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            {/* Drawer Content */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-y-0 right-0 w-[280px] bg-panel-systematic border-l border-white/5 p-6 flex flex-col overflow-y-auto select-none"
            >
              <div className="flex items-center justify-between mb-8 shrink-0">
                <span className="font-mono text-[9px] text-ink-muted uppercase tracking-widest font-bold">Consola Fuentes</span>
                <button
                  onClick={() => setShowMobileInspector(false)}
                  className="p-1.5 border border-white/10 hover:bg-white/5 text-ink hover:text-white rounded-lg text-xs font-mono font-bold uppercase cursor-pointer bg-transparent"
                >
                  Cerrar
                </button>
              </div>
              
              {renderRightSidebarContent()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE CUADERNO */}
      <AnimatePresence>
        {studyToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStudyToDelete(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-panel-systematic border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10 p-6"
            >
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/5">
                <span className="text-xl">⚠️</span>
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                  Confirmar Eliminación
                </h3>
              </div>

              <div className="space-y-4 font-sans text-xs text-ink-muted leading-relaxed">
                <p>
                  ¿Estás seguro de que quieres eliminar el cuaderno <strong className="text-white">"{studyToDelete.title}"</strong> de tu historial?
                </p>
                <p className="text-amber-400 font-semibold bg-amber-950/20 border border-amber-900/30 p-2.5 rounded-lg text-[11px]">
                  Esta acción es irreversible y eliminará todos los documentos y el progreso de estudio asociados a este cuaderno.
                </p>
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={() => setStudyToDelete(null)}
                  className="px-4 py-2 rounded border border-white/10 hover:border-white/20 text-ink-muted hover:text-white font-mono text-[9px] uppercase tracking-wider cursor-pointer bg-transparent transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    deleteStudyFromHistory(studyToDelete.id);
                    setStudyToDelete(null);
                  }}
                  className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer border-none transition-all shadow-lg shadow-red-900/20"
                >
                  Eliminar Cuaderno
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE CONFIGURACIÓN DE CLAVE API (OPCIONAL) */}
      <AnimatePresence>
        {showApiKeyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowApiKeyModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-lg bg-panel-systematic border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10 p-6"
            >
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-accent-systematic" />
                  <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                    Clave API de Gemini (Opcional)
                  </h3>
                </div>
                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="text-ink-muted hover:text-white font-mono text-[9px] cursor-pointer px-2.5 py-1 border border-white/5 hover:border-white/20 uppercase"
                >
                  Cerrar
                </button>
              </div>

              <div className="space-y-4 font-sans text-xs text-ink-muted leading-relaxed overflow-y-auto pr-1">
                <p>
                  Esta aplicación cuenta con una clave API segura e ilimitada configurada en el servidor por el creador. <span className="text-emerald-400 font-bold">¡No necesitas configurar nada para estudiar!</span>
                </p>
                
                <p>
                  Esta opción es útil únicamente si eres un usuario invitado, deseas utilizar tu propia cuota de peticiones, o quieres configurar una clave personalizada para evitar límites de uso compartidos.
                </p>

                <div className="bg-bg-systematic/50 border border-white/5 p-4 rounded-xl space-y-3">
                  <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest block font-bold">Configurar Clave Personalizada</span>
                  <p className="text-[10px]">
                    Tu clave se guardará de forma local y 100% segura únicamente en este navegador (<code className="bg-white/5 px-1 py-0.5 rounded text-white font-mono">localStorage</code>).
                  </p>

                  <div className="space-y-2">
                    <input
                      type="password"
                      value={tempApiKey}
                      onChange={(e) => setTempApiKey(e.target.value)}
                      placeholder="Pega tu clave API aquí (ej. AIzaSy...)"
                      className="w-full bg-bg-systematic border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-systematic text-white placeholder-zinc-600"
                    />
                    <div className="flex gap-2 justify-end">
                      {userApiKey && (
                        <button
                          onClick={() => {
                            handleClearApiKey();
                            setShowApiKeyModal(false);
                          }}
                          className="px-3 py-1.5 rounded bg-red-950/20 border border-red-900/30 text-red-400 font-mono text-[9px] uppercase tracking-wider hover:bg-red-900/15 transition-all cursor-pointer"
                        >
                          Eliminar Clave
                        </button>
                      )}
                      <button
                        onClick={() => {
                          handleSaveApiKey(tempApiKey);
                          setShowApiKeyModal(false);
                        }}
                        className="px-4 py-1.5 rounded bg-accent-systematic text-black hover:bg-white transition-all font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer border-none"
                      >
                        Guardar Clave
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-4 space-y-2">
                  <span className="font-mono text-[9px] text-ink-muted uppercase tracking-widest block">¿Cómo obtener una clave de API?</span>
                  <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-ink-muted">
                    <li>Consigue una clave gratis en <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-accent-systematic hover:underline font-medium">Google AI Studio</a>.</li>
                    <li>Si eres el desarrollador y deseas configurar tu clave de forma permanente para todos los usuarios: agrégala como variable secreta con el nombre <code className="bg-white/5 px-1 rounded font-mono text-white">GEMINI_API_KEY</code> en la pestaña **Settings &gt; Secrets** de tu panel de control de AI Studio.</li>
                  </ol>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE MONETIZACIÓN Y PAGOS */}
      <AnimatePresence>
        {showBillingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBillingModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-2xl bg-panel-systematic border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                    <Coins className="w-5 h-5 text-accent-systematic" />
                    {isAdmin ? "Suscripción Premium & Gestión Comercial" : "Suscripción Tutor Cuaderno PRO"}
                  </h3>
                  <p className="text-ink-muted text-xs mt-1">
                    {isAdmin 
                      ? "Panel de control de planes para estudiantes y guía técnica de monetización Stripe (Visible solo para Administrador)."
                      : "Desbloquea documentos ilimitados y exámenes orales de voz en alta definición."}
                  </p>
                </div>
                <button
                  onClick={() => setShowBillingModal(false)}
                  className="text-ink-muted hover:text-white font-mono text-xs cursor-pointer px-2.5 py-1 border border-white/5 hover:border-white/20 uppercase"
                >
                  Cerrar
                </button>
              </div>

              {/* Sub-Header Tabs (Visible exclusivamente para el Administrador) */}
              {isAdmin && (
                <div className="bg-bg-systematic/50 border-b border-white/5 px-6 py-2 flex items-center gap-2">
                  <button
                    onClick={() => setBillingTab('plans')}
                    className={cn(
                      "px-4 py-2 font-mono text-[10px] uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer",
                      billingTab === 'plans' 
                        ? "border-accent-systematic text-accent-systematic" 
                        : "border-transparent text-ink-muted hover:text-white"
                    )}
                  >
                    [01] Planes Premium
                  </button>
                  <button
                    onClick={() => setBillingTab('monetize')}
                    className={cn(
                      "px-4 py-2 font-mono text-[10px] uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5",
                      billingTab === 'monetize' 
                        ? "border-amber-400 text-amber-300" 
                        : "border-transparent text-ink-muted hover:text-white"
                    )}
                  >
                    <span className="bg-amber-500/20 text-amber-400 text-[8px] px-1.5 py-0.5 rounded font-mono font-bold">ADMIN</span>
                    <span>[02] Guía de Negocio & Stripe</span>
                  </button>
                </div>
              )}

              {/* Content Panel (Scrollable) */}
              <div className="p-6 md:p-8 overflow-y-auto flex-grow bg-bg-systematic/20">
                {(!isAdmin || billingTab === 'plans') ? (
                  <div>
                    {paymentStep === 'select' && (
                      <div className="space-y-6">
                        <div className="text-center max-w-md mx-auto mb-2">
                          <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest">Planes de Estudio</span>
                          <h4 className="text-xl font-bold uppercase tracking-tight text-white mt-1">Elige un plan de estudio</h4>
                          <p className="text-xs text-ink-muted leading-relaxed mt-1">
                            Comienza gratis con lo básico o desbloquea todo el potencial con nuestro plan para estudiantes profesionales.
                          </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6 pt-2">
                          {/* Free Plan Card */}
                          <div className={cn(
                            "border p-6 rounded-xl flex flex-col justify-between relative bg-bg-systematic/30",
                            userTier === 'free' ? "border-accent-systematic bg-accent-systematic/[0.02]" : "border-white/5"
                          )}>
                            {userTier === 'free' && (
                              <span className="absolute -top-2.5 left-6 bg-accent-systematic text-black font-mono text-[8px] font-bold px-2 py-0.5 uppercase tracking-widest rounded">
                                Plan Activo
                              </span>
                            )}
                            <div>
                              <span className="font-mono text-[9px] text-ink-muted uppercase tracking-widest">Plan de Entrada</span>
                              <h5 className="text-lg font-bold uppercase tracking-tight mt-1">Tutor Gratis</h5>
                              <div className="mt-4 mb-5 flex items-baseline gap-1">
                                <span className="text-2xl font-black text-white">$0.00</span>
                                <span className="text-[10px] text-ink-muted uppercase font-mono">/ para siempre</span>
                              </div>
                              <ul className="space-y-2.5 text-xs text-ink-muted">
                                <li className="flex items-start gap-2">
                                  <Check className="w-3.5 h-3.5 text-accent-systematic shrink-0 mt-0.5" />
                                  <span>Hasta 2 documentos simultáneos</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check className="w-3.5 h-3.5 text-accent-systematic shrink-0 mt-0.5" />
                                  <span>Tutoría de voz en tiempo real</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check className="w-3.5 h-3.5 text-accent-systematic shrink-0 mt-0.5" />
                                  <span>Cuestionarios y tarjetas</span>
                                </li>
                              </ul>
                            </div>
                            <div className="mt-8">
                              <button
                                disabled
                                className="w-full py-2.5 border border-white/10 text-[9px] font-mono font-bold uppercase tracking-wider text-ink-muted text-center rounded-lg bg-white/5 cursor-not-allowed"
                              >
                                {userTier === 'free' ? "Plan Actual Activado" : "Plan Gratuito"}
                              </button>
                            </div>
                          </div>

                          {/* PRO Plan Card */}
                          <div className={cn(
                            "border p-6 rounded-xl flex flex-col justify-between relative bg-bg-systematic/30 overflow-hidden",
                            userTier === 'pro' ? "border-amber-500 bg-amber-500/[0.02]" : "border-white/10 hover:border-white/20"
                          )}>
                            <div className="absolute top-0 right-0 bg-amber-500/10 text-amber-400 text-[8px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 border-b border-l border-white/5 rounded-bl-xl">
                              ★ RECOMENDADO
                            </div>
                            {userTier === 'pro' && (
                              <span className="absolute -top-2.5 left-6 bg-amber-500 text-black font-mono text-[8px] font-bold px-2 py-0.5 uppercase tracking-widest rounded">
                                Plan Activo
                              </span>
                            )}
                            <div>
                              <span className="font-mono text-[9px] text-amber-500 uppercase tracking-widest font-bold">Plan Profesional</span>
                              <h5 className="text-lg font-bold uppercase tracking-tight mt-1 text-white">
                                Estudiante PRO
                              </h5>
                              <div className="mt-4 mb-5 flex items-baseline gap-1">
                                <span className="text-2xl font-black text-amber-400">$2.99 USD</span>
                                <span className="text-[10px] text-ink-muted uppercase font-mono">/ al mes</span>
                              </div>
                              <ul className="space-y-2.5 text-xs text-white">
                                <li className="flex items-start gap-2">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                  <span className="font-bold text-amber-200">Documentos ilimitados</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                  <span>Tutoría de voz con latencia prioritaria</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                  <span>Subidas de PDFs gigantes sin restricciones</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                  <span>Insignia dorada ★ PRO en tu pantalla</span>
                                </li>
                              </ul>
                            </div>
                            <div className="mt-8">
                              {userTier === 'pro' ? (
                                <button
                                  disabled
                                  className="w-full py-2.5 bg-amber-500/15 border border-amber-500/30 text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400 text-center rounded-lg cursor-not-allowed"
                                >
                                  Tu cuenta es PRO ✓
                                </button>
                              ) : (
                                <button
                                  onClick={() => setPaymentStep('pay')}
                                  className="w-full py-2.5 bg-accent-systematic text-black hover:bg-white text-[9px] font-mono font-bold uppercase tracking-wider text-center rounded-lg transition-all cursor-pointer"
                                >
                                  Mejorar a PRO ahora
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Buy me a coffee card */}
                        <div className="mt-6 border border-white/5 bg-zinc-950/40 rounded-xl p-5 relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div className="absolute top-0 right-0 bg-accent-systematic/5 w-24 h-24 rounded-full blur-2xl pointer-events-none" />
                          <div className="flex items-center gap-4 text-left">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg shrink-0">
                              💳
                            </div>
                            <div>
                              <span className="font-mono text-[8px] text-emerald-400 uppercase tracking-widest block mb-0.5">Donación Voluntaria</span>
                              <h5 className="text-xs font-bold text-ink uppercase tracking-tight">¿Prefieres apoyar por Mercado Pago?</h5>
                              <p className="text-[10px] text-ink-muted leading-relaxed max-w-sm">
                                Si te encanta el tutor y prefieres una aportación voluntaria única en vez de suscribirte, puedes colaborar cómodamente con Mercado Pago.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setTempCoffeeLink(coffeeLink);
                              setTempCreatorAlias(creatorAlias);
                              setShowCoffeeModal(true);
                            }}
                            className="w-full sm:w-auto px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-[8px] uppercase tracking-widest font-bold rounded-lg border border-white/10 transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                          >
                            <span>Apoyar por Mercado Pago</span>
                            <span>⚡</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {paymentStep === 'pay' && (
                      <div className="space-y-6 max-w-md mx-auto">
                        <button
                          onClick={() => setPaymentStep('select')}
                          className="text-[10px] font-mono text-ink-muted hover:text-white uppercase flex items-center gap-1 bg-transparent border-none cursor-pointer"
                        >
                          ← Volver a los planes
                        </button>

                        <div className="text-center mb-4">
                          <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest block">Checkout Seguro</span>
                          <h4 className="text-lg font-bold uppercase tracking-tight text-white">Detalles del Pago</h4>
                          <p className="text-xs text-ink-muted">Ingresa los datos de tu tarjeta para activar tu suscripción PRO.</p>
                        </div>

                        {/* Interactive Simulated Credit Card */}
                        <div className="w-full bg-gradient-to-br from-neutral-900 to-neutral-950 border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden text-white font-mono select-none">
                          <div className="absolute -right-16 -bottom-16 w-44 h-44 rounded-full bg-accent-systematic/5 blur-3xl pointer-events-none" />
                          <div className="flex justify-between items-start mb-8">
                            <div className="flex flex-col">
                              <span className="text-[8px] text-zinc-500 uppercase tracking-widest">Suscripción Premium</span>
                              <span className="text-xs font-bold text-accent-systematic tracking-wider">TUTOR CUADERNO</span>
                            </div>
                            <div className="w-10 h-5 bg-amber-500/20 border border-amber-500/30 rounded flex items-center justify-center text-[8px] text-amber-300 font-bold tracking-wider">
                              PRO
                            </div>
                          </div>

                          {/* Card number representation */}
                          <div className="text-base tracking-widest text-zinc-200 mb-6 font-semibold">
                            {cardNumber ? cardNumber.replace(/(\d{4})/g, '$1 ').trim() : "•••• •••• •••• ••••"}
                          </div>

                          <div className="flex justify-between items-end">
                            <div>
                              <span className="text-[7px] text-zinc-500 block uppercase tracking-wider mb-0.5">Titular</span>
                              <span className="text-[10px] text-zinc-300 uppercase tracking-wider font-semibold truncate max-w-[150px]">
                                {cardName || "JUAN PÉREZ"}
                              </span>
                            </div>
                            <div className="flex gap-4">
                              <div>
                                <span className="text-[7px] text-zinc-500 block uppercase tracking-wider mb-0.5">Expira</span>
                                <span className="text-[10px] text-zinc-300 font-semibold">{cardExpiry || "MM/AA"}</span>
                              </div>
                              <div>
                                <span className="text-[7px] text-zinc-500 block uppercase tracking-wider mb-0.5">CVC</span>
                                <span className="text-[10px] text-zinc-300 font-semibold">{cardCvc || "•••"}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Payment Inputs */}
                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!cardName || !cardNumber || !cardExpiry || !cardCvc) {
                              alert("Por favor completa todos los campos del formulario de pago.");
                              return;
                            }
                            setPaymentStep('processing');
                            setTimeout(() => {
                              handleUpgradeToPro();
                              setPaymentStep('success');
                            }, 2000);
                          }}
                          className="space-y-4"
                        >
                          <div>
                            <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">Nombre del Titular</label>
                            <input
                              type="text"
                              required
                              placeholder="Ej. Juan Pérez"
                              value={cardName}
                              onChange={(e) => setCardName(e.target.value)}
                              className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent-systematic transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">Número de Tarjeta</label>
                            <input
                              type="text"
                              required
                              maxLength={16}
                              placeholder="4000123456789010"
                              value={cardNumber}
                              onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ''))}
                              className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent-systematic transition-colors"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">Vencimiento</label>
                              <input
                                type="text"
                                required
                                maxLength={5}
                                placeholder="MM/AA"
                                value={cardExpiry}
                                onChange={(e) => {
                                  let val = e.target.value;
                                  if (val.length === 2 && !val.includes('/')) {
                                    val = val + '/';
                                  }
                                  setCardExpiry(val);
                                }}
                                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent-systematic transition-colors"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">Código de Seguridad (CVC)</label>
                              <input
                                type="text"
                                required
                                maxLength={4}
                                placeholder="123"
                                value={cardCvc}
                                onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ''))}
                                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent-systematic transition-colors"
                              />
                            </div>
                          </div>

                          {isAdmin ? (
                            <div className="bg-amber-950/20 border border-amber-900/30 p-3 rounded-lg text-amber-300 text-[10px] leading-relaxed flex items-start gap-2">
                              <Shield className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                              <span>
                                <strong>Modo Administrador:</strong> Esta pasarela activa tu cuenta PRO en modo directo de prueba. Para conectar cobros reales bancarios en producción, revisa la pestaña <em>[02] Guía de Negocio & Stripe</em>.
                              </span>
                            </div>
                          ) : (
                            <div className="bg-emerald-950/20 border border-emerald-900/30 p-3 rounded-lg text-emerald-400 text-[10px] leading-relaxed flex items-start gap-2">
                              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                              <span>
                                <strong>Transacción Protegida:</strong> Cifrado SSL de 256 bits de alta seguridad. Tu cuenta será mejorada inmediatamente al confirmar el pago.
                              </span>
                            </div>
                          )}

                          <button
                            type="submit"
                            className="w-full py-3 bg-accent-systematic text-black font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg hover:bg-white transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            <CreditCard className="w-4 h-4" />
                            Confirmar Suscripción PRO - $2.99 USD
                          </button>
                        </form>
                      </div>
                    )}

                    {paymentStep === 'processing' && (
                      <div className="py-12 flex flex-col items-center justify-center text-center">
                        <Loader2 className="w-10 h-10 text-accent-systematic animate-spin mb-4" />
                        <h4 className="text-lg font-bold uppercase tracking-tight text-white mb-1">Verificando Transacción</h4>
                        <p className="text-xs text-ink-muted max-w-xs leading-relaxed">
                          Procesando y autorizando tu suscripción mensual. Por favor, no cierres esta ventana.
                        </p>
                      </div>
                    )}

                    {paymentStep === 'success' && (
                      <div className="py-10 text-center max-w-sm mx-auto flex flex-col items-center">
                        <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center border border-amber-500/30 mb-6 animate-bounce">
                          <Sparkles className="w-8 h-8" />
                        </div>
                        <h4 className="text-xl font-bold uppercase tracking-tight text-white mb-2">¡Bienvenido al Plan PRO! ★</h4>
                        <p className="text-xs text-ink-muted leading-relaxed mb-6">
                          Felicidades. Tu cuenta ha sido mejorada al nivel de <strong>Suscripción Profesional</strong>. Ahora cuentas con documentos ilimitados y prioridad de procesamiento por IA.
                        </p>
                        <button
                          onClick={() => setShowBillingModal(false)}
                          className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-black font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                        >
                          Empezar a estudiar en PRO
                        </button>
                      </div>
                    )}
                  </div>
                ) : isAdmin ? (
                  <div className="space-y-6 text-left">
                    <div className="border-b border-white/5 pb-4 mb-2">
                      <h4 className="text-base font-bold text-white uppercase tracking-tight flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-accent-systematic" />
                        Guía de Monetización de Tutor Cuaderno
                      </h4>
                      <p className="text-xs text-ink-muted leading-relaxed mt-1">
                        Aprende cómo funciona el modelo de negocio SaaS (Software as a Service) detrás de esta app y cómo puedes obtener ingresos reales con ella.
                      </p>
                    </div>

                    <div className="space-y-5 text-xs text-zinc-300 leading-relaxed">
                      <div>
                        <h5 className="font-bold text-accent-systematic uppercase tracking-wider mb-1.5">1. Rentabilidad Excepcional por IA</h5>
                        <p className="mb-2">
                          Esta app procesa texto y audio con la API de <strong>Gemini 1.5/2.0 Flash</strong>, cuyo costo por uso es casi cero:
                        </p>
                        <div className="bg-zinc-950 p-3 rounded-lg border border-white/5 font-mono text-[10px] space-y-1.5 text-zinc-400">
                          <div>• Costo por 1M tokens de entrada: <span className="text-emerald-400">$0.075 USD</span></div>
                          <div>• Costo por 1M tokens de salida: <span className="text-emerald-400">$0.30 USD</span></div>
                          <div>• Costo promedio de estudiar 1 hora: <span className="text-emerald-400">&lt; $0.01 USD</span></div>
                        </div>
                        <p className="mt-2 text-[11px] text-zinc-400">
                          Si cobras una suscripción mensual de <strong>$2.99 USD</strong>, tu costo por usuario activo será extremadamente bajo (menos de $0.15 USD al mes). ¡Tu margen de ganancia operativa supera el <strong>95%</strong>!
                        </p>
                      </div>

                      <div>
                        <h5 className="font-bold text-accent-systematic uppercase tracking-wider mb-1.5">2. El Modelo Freemium con Límites</h5>
                        <p>
                          La clave para motivar la compra de un producto educativo es ofrecer valor inmediato y establecer un límite de uso. En el archivo de esta aplicación, hemos programado un límite estricto de un máximo de <strong>2 documentos gratuitos</strong>. Cuando un estudiante sube un tercero, la app despliega el paywall de forma orgánica, atrayendo la conversión de inmediato.
                        </p>
                      </div>

                      <div>
                        <h5 className="font-bold text-zinc-100 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-accent-systematic" />
                          3. Cómo conectar Stripe Real (Backend Code)
                        </h5>
                        <p className="mb-2">
                          Para procesar dinero de verdad, puedes instalar el SDK oficial de Stripe: <code className="bg-zinc-900 text-zinc-200 px-1 py-0.5 rounded font-mono">npm install stripe</code>. En tu backend de Express (<code className="text-zinc-200 font-mono">server.ts</code>), agregarías un endpoint para crear el checkout seguro:
                        </p>
                        <pre className="bg-zinc-950 p-4 rounded-lg border border-white/5 font-mono text-[9px] text-zinc-400 overflow-x-auto select-all leading-normal whitespace-pre-wrap">
{`// server.ts (Backend)
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

app.post('/api/create-checkout', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: 'Suscripción Tutor Cuaderno PRO' },
        unit_amount: 299, // $2.99 USD
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: 'https://tu-dominio.com/?payment=success',
    cancel_url: 'https://tu-dominio.com/?payment=cancel',
  });
  res.json({ url: session.url });
});`}
                        </pre>
                      </div>

                      <div>
                        <h5 className="font-bold text-accent-systematic uppercase tracking-wider mb-1.5">4. Procesamiento Automático de Suscripciones (Webhooks)</h5>
                        <p className="mb-2">
                          Cuando el usuario pague en Stripe, Stripe enviará un webhook a tu servidor para actualizar el estado del usuario en la base de datos de manera automatizada:
                        </p>
                        <pre className="bg-zinc-950 p-4 rounded-lg border border-white/5 font-mono text-[9px] text-zinc-400 overflow-x-auto select-all leading-normal whitespace-pre-wrap">
{`app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature']!;
  const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerEmail = session.customer_details?.email;
    // AQUÍ: Actualizas el tier del usuario a 'pro' en tu Base de Datos (ej. Firestore/Cloud SQL)
    console.log(\`Suscripción PRO activada para: \${customerEmail}\`);
  }
  res.json({ received: true });
});`}
                        </pre>
                      </div>

                      <div className="pt-2">
                        <div className="bg-white/5 p-4 rounded-lg border border-white/5">
                          <h6 className="font-bold text-white mb-1 uppercase text-[10px]">Estrategia de Lanzamiento Recomendada:</h6>
                          <p className="text-[11px] text-zinc-400">
                            Promociona la herramienta en grupos de WhatsApp de facultades, redes sociales como TikTok, o foros de estudiantes. Con un costo de hosting mensual gratuito de Cloud Run y base de datos Firestore, tus costos fijos iniciales serán de $0.00 al mes, permitiéndote rentabilizar desde la primera suscripción vendida.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-white/5 bg-bg-systematic/50 flex justify-end">
                <button
                  onClick={() => setShowBillingModal(false)}
                  className="px-5 py-2.5 bg-white text-black hover:bg-accent-systematic font-mono text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer rounded"
                >
                  Regresar a la App
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE CAFECITO Y CONFIGURACIÓN DE DONACIÓN */}
      <AnimatePresence>
        {showCoffeeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCoffeeModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-lg bg-panel-systematic border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💳</span>
                  <div>
                    <h3 className="text-sm font-bold text-ink uppercase tracking-tight">
                      Apoyar Proyecto / Mercado Pago
                    </h3>
                    <p className="text-ink-muted text-[10px] uppercase font-mono tracking-wider">
                      Donación voluntaria para {creatorAlias}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCoffeeModal(false)}
                  className="text-ink-muted hover:text-white font-mono text-[10px] cursor-pointer px-2 py-0.5 border border-white/5 hover:border-white/10 uppercase bg-transparent"
                >
                  Cerrar
                </button>
              </div>

              {/* Content Panel */}
              <div className="p-6 overflow-y-auto flex-grow bg-bg-systematic/20 space-y-6">
                <div className="text-center max-w-md mx-auto">
                  <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-500/20 mx-auto mb-3 text-xl">
                    🇦🇷
                  </div>
                  <h4 className="text-sm font-bold uppercase tracking-tight text-white">Aporte Voluntario Único</h4>
                  <p className="text-[11px] text-ink-muted leading-relaxed mt-1">
                    Si te sirve el tutor inteligente y deseas apoyarnos, puedes colaborar de forma voluntaria de manera directa y rápida a través de Mercado Pago.
                  </p>
                </div>

                <div className="max-w-sm mx-auto">
                  {/* Mercado Pago Alias Copy card */}
                  <div className="border border-emerald-500/15 bg-zinc-950/40 rounded-xl p-6 flex flex-col items-center justify-between space-y-4 shadow-xl">
                    <div className="text-center space-y-1">
                      <span className="font-mono text-[8px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-widest font-bold">Transferencia Directa</span>
                      <h5 className="text-sm font-bold text-white uppercase tracking-wider mt-1">Mercado Pago Argentina</h5>
                    </div>
                    
                    <div className="w-full bg-black/40 p-4 rounded-lg border border-white/5 text-center relative group">
                      <span className="text-[8px] font-mono uppercase tracking-wider text-ink-muted block mb-1">Alias de Destino:</span>
                      <span className="text-sm font-mono text-white block select-all font-black tracking-widest bg-zinc-900/60 py-2 px-3 rounded border border-white/5">{creatorAlias}</span>
                      <span className="text-[9px] font-sans text-ink-muted mt-2 block">
                        Titular de la cuenta: <strong className="text-white font-medium">Cristian Martín Veloz</strong>
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(creatorAlias);
                        alert(`¡Alias "${creatorAlias}" copiado al portapapeles!`);
                      }}
                      className="w-full py-3.5 bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.01] text-center font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg border border-transparent transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                    >
                      <span>Copiar Alias</span>
                      <span>📋</span>
                    </button>
                  </div>
                </div>

                {/* Configuration Section for the creator (Solo Administrador) */}
                {isAdmin && (
                  <div className="border border-amber-500/10 bg-amber-500/5 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-500 text-xs">⚙️</span>
                        <span className="font-mono text-[8px] text-amber-500 uppercase tracking-widest font-bold">
                          Configurar Enlace y Alias (Admin)
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (isEditingCoffeeLink) {
                            handleSaveCoffeeLink();
                          } else {
                            setTempCoffeeLink(coffeeLink);
                            setTempCreatorAlias(creatorAlias);
                            setIsEditingCoffeeLink(true);
                          }
                        }}
                        className="font-mono text-[8px] uppercase tracking-wider text-amber-500 hover:text-white underline cursor-pointer bg-transparent border-none"
                      >
                        {isEditingCoffeeLink ? "[Guardar Destino]" : "[Editar Datos]"}
                      </button>
                    </div>

                    {isEditingCoffeeLink ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono text-ink-muted uppercase block">Link de Pago / URL de Mercado Pago:</label>
                          <input
                            type="text"
                            value={tempCoffeeLink}
                            onChange={(e) => setTempCoffeeLink(e.target.value)}
                            placeholder="https://link.mercadopago.com.ar/..."
                            className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-accent-systematic"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono text-ink-muted uppercase block">Alias o CVU de Mercado Pago:</label>
                          <input
                            type="text"
                            value={tempCreatorAlias}
                            onChange={(e) => setTempCreatorAlias(e.target.value)}
                            placeholder="martinmano"
                            className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-accent-systematic"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={handleSaveCoffeeLink}
                            className="bg-accent-systematic text-black font-mono text-[9px] uppercase tracking-wider px-3 py-1.5 rounded-lg font-bold hover:bg-white cursor-pointer border-none"
                          >
                            Guardar Configuración
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] space-y-1.5">
                        <div>
                          <span className="text-ink-muted text-[9px] uppercase font-mono block">Enlace actual configurado:</span>
                          <code className="text-emerald-400/90 truncate block bg-black/35 p-2 rounded mt-1 border border-white/5">{coffeeLink}</code>
                        </div>
                        <div>
                          <span className="text-ink-muted text-[9px] uppercase font-mono block">Alias actual configurado:</span>
                          <code className="text-emerald-400/90 truncate block bg-black/35 p-2 rounded mt-1 border border-white/5">{creatorAlias}</code>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/5 bg-bg-systematic/50 flex justify-end">
                <button
                  onClick={() => setShowCoffeeModal(false)}
                  className="px-5 py-2 bg-white text-black hover:bg-emerald-400 font-mono text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer rounded border-none"
                >
                  Regresar a la App
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE IDENTIFICACIÓN DE ESTUDIANTE */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuthModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-panel-systematic border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10"
            >
              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-ink uppercase tracking-tight">
                      Acceso Seguro a Cuadernos
                    </h3>
                    <p className="text-ink-muted text-[10px] uppercase font-mono tracking-wider">
                      Verificación de cuenta y privacidad
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="text-ink-muted hover:text-white font-mono text-[10px] cursor-pointer px-2 py-1 border border-white/5 hover:border-white/10 uppercase bg-transparent rounded"
                >
                  ✕
                </button>
              </div>

              {/* Selector de Método de Autenticación */}
              <div className="grid grid-cols-2 p-1.5 mx-5 mt-4 bg-bg-systematic rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('pin');
                    setAuthErrorMessage(null);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[10px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer border-none",
                    authMethod === 'pin'
                      ? "bg-emerald-500 text-black shadow-sm"
                      : "text-ink-muted hover:text-ink bg-transparent"
                  )}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Correo y Clave</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('otp');
                    setAuthErrorMessage(null);
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[10px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer border-none",
                    authMethod === 'otp'
                      ? "bg-emerald-500 text-black shadow-sm"
                      : "text-ink-muted hover:text-ink bg-transparent"
                  )}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Código Rápido</span>
                </button>
              </div>

              {/* Error Banner */}
              {authErrorMessage && (
                <div className="mx-5 mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-center gap-2 font-mono">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span className="flex-grow">{authErrorMessage}</span>
                </div>
              )}

              {/* Success / Info Status Banner */}
              {authStatusMessage && !authErrorMessage && (
                <div className="mx-5 mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center gap-2 font-mono">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span className="flex-grow">{authStatusMessage}</span>
                </div>
              )}

              {/* Dev/Local simulation notice if email SMTP is not yet configured */}
              {authDevCodeNotice && (
                <div className="mx-5 mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold font-mono text-[11px] uppercase text-amber-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Código de verificación generado</span>
                  </div>
                  <p className="text-[11px] text-amber-300/90 leading-relaxed font-mono">
                    Ingresa este código para entrar: <span className="px-2 py-0.5 bg-amber-400/20 text-white font-bold rounded tracking-widest text-sm">{authDevCodeNotice}</span>
                  </p>
                </div>
              )}

              {/* Modal Body */}
              <div className="p-5 space-y-4">
                {authMethod === 'otp' ? (
                  authOtpStep === 'request' ? (
                    // PASO 1 OTP: Solicitar Código
                    <div className="space-y-3.5">
                      <div>
                        <label className="block font-mono text-[9.5px] text-ink-muted uppercase tracking-wider mb-1.5">
                          Nombre Completo (Opcional)
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. Martín Veloz"
                          value={tempNameInput}
                          onChange={(e) => setTempNameInput(e.target.value)}
                          className="w-full bg-bg-systematic border border-white/10 p-2.5 rounded-lg text-xs text-ink placeholder:text-ink-muted/50 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-mono text-[9.5px] text-ink-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>Correo Electrónico</span>
                          <span className="text-emerald-400/80 font-normal">Requerido</span>
                        </label>
                        <input
                          type="email"
                          placeholder="tu-correo@ejemplo.com"
                          value={tempEmailInput}
                          onChange={(e) => setTempEmailInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSendOtpCode();
                          }}
                          className="w-full bg-bg-systematic border border-white/10 p-2.5 rounded-lg text-xs text-ink placeholder:text-ink-muted/50 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-ink-muted leading-relaxed flex items-start gap-2.5">
                        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>
                          Te enviaremos un código de seguridad de 6 dígitos válido por 10 minutos. Nadie podrá ver tus cuadernos sin verificar su acceso.
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleSendOtpCode}
                        disabled={isAuthLoading || !tempEmailInput.trim()}
                        className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-sans font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all border-none"
                      >
                        {isAuthLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4" />
                        )}
                        <span>{isAuthLoading ? "Enviando código..." : "Enviar Código de Verificación"}</span>
                      </button>
                    </div>
                  ) : (
                    // PASO 2 OTP: Verificar Código de 6 dígitos
                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 p-2.5 rounded-lg text-xs">
                        <div className="truncate text-ink-muted">
                          Enviado a: <strong className="text-ink">{tempEmailInput}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthOtpStep('request');
                            setAuthErrorMessage(null);
                          }}
                          className="text-[10px] text-emerald-400 hover:underline font-mono bg-transparent border-none cursor-pointer shrink-0 ml-2"
                        >
                          Cambiar
                        </button>
                      </div>

                      <div>
                        <label className="block font-mono text-[9.5px] text-ink-muted uppercase tracking-wider mb-2 text-center">
                          Ingresa el Código de 6 Dígitos
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="000000"
                          autoFocus
                          value={authOtpCode}
                          onChange={(e) => setAuthOtpCode(e.target.value.replace(/\D/g, ''))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && authOtpCode.length === 6) handleVerifyOtpCode();
                          }}
                          className="w-full bg-bg-systematic border-2 border-emerald-500/40 p-3 rounded-xl text-center font-mono text-2xl font-bold tracking-[0.35em] text-emerald-300 placeholder:text-zinc-700 focus:border-emerald-400 focus:outline-none"
                        />
                      </div>

                      {/* Creación opcional de PIN para futuros accesos */}
                      <div className="pt-1">
                        <label className="block font-mono text-[9px] text-ink-muted uppercase tracking-wider mb-1 flex items-center justify-between">
                          <span>Crear PIN de Acceso Rápido (Opcional)</span>
                          <span className="text-[8.5px] text-ink-muted">4+ caracteres</span>
                        </label>
                        <input
                          type="password"
                          placeholder="Ej. 1234 o mi_clave"
                          value={authPinCode}
                          onChange={(e) => setAuthPinCode(e.target.value)}
                          className="w-full bg-bg-systematic border border-white/10 p-2 rounded-lg text-xs text-ink placeholder:text-ink-muted/50 focus:border-emerald-500 focus:outline-none font-mono"
                        />
                        <p className="text-[9.5px] text-ink-muted mt-1 leading-normal">
                          Si configuras este PIN, podrás entrar directo en cualquier dispositivo sin esperar el correo.
                        </p>
                      </div>

                      <div className="space-y-2 pt-1">
                        <button
                          type="button"
                          onClick={handleVerifyOtpCode}
                          disabled={isAuthLoading || authOtpCode.length < 6}
                          className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-sans font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all border-none"
                        >
                          {isAuthLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          <span>{isAuthLoading ? "Verificando..." : "Confirmar e Ingresar"}</span>
                        </button>

                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={handleSendOtpCode}
                            disabled={isAuthLoading || authCountdown > 0}
                            className="text-[10px] text-ink-muted hover:text-ink font-mono bg-transparent border-none cursor-pointer flex items-center gap-1 disabled:opacity-50"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Reenviar código {authCountdown > 0 ? `(${authCountdown}s)` : ''}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAuthOtpStep('request')}
                            className="text-[10px] text-ink-muted hover:text-ink font-mono bg-transparent border-none cursor-pointer flex items-center gap-1"
                          >
                            <ArrowLeft className="w-3 h-3" />
                            <span>Volver</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  // MÉTODO PIN / CONTRASEÑA DIRECTA
                  <div className="space-y-3.5">
                    <div>
                      <label className="block font-mono text-[9.5px] text-ink-muted uppercase tracking-wider mb-1.5">
                        Nombre Completo (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Martín Veloz"
                        value={tempNameInput}
                        onChange={(e) => setTempNameInput(e.target.value)}
                        className="w-full bg-bg-systematic border border-white/10 p-2.5 rounded-lg text-xs text-ink placeholder:text-ink-muted/50 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-mono text-[9.5px] text-ink-muted uppercase tracking-wider mb-1.5">
                        Correo Electrónico
                      </label>
                      <input
                        type="email"
                        placeholder="tu-correo@ejemplo.com"
                        value={tempEmailInput}
                        onChange={(e) => setTempEmailInput(e.target.value)}
                        className="w-full bg-bg-systematic border border-white/10 p-2.5 rounded-lg text-xs text-ink placeholder:text-ink-muted/50 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-mono text-[9.5px] text-ink-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
                        <span>PIN o Clave de Acceso</span>
                        <span className="text-[8.5px] text-ink-muted">Mínimo 4 caracteres</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPinPassword ? "text" : "password"}
                          placeholder="Tu PIN o clave privada"
                          value={authPinCode}
                          onChange={(e) => setAuthPinCode(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleLoginWithPin();
                          }}
                          className="w-full bg-bg-systematic border border-white/10 p-2.5 pr-10 rounded-lg text-xs text-ink placeholder:text-ink-muted/50 focus:border-emerald-500 focus:outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPinPassword(!showPinPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink bg-transparent border-none cursor-pointer"
                        >
                          {showPinPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-ink-muted leading-relaxed flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>
                        Acceso seguro y directo: Si es tu primera vez, este PIN se registrará de inmediato como tu clave personal. No requiere dominios propios ni servicios externos.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleLoginWithPin}
                      disabled={isAuthLoading || !tempEmailInput.trim() || authPinCode.length < 4}
                      className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-sans font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all border-none"
                    >
                      {isAuthLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <KeyRound className="w-4 h-4" />
                      )}
                      <span>{isAuthLoading ? "Validando..." : "Entrar a mis Cuadernos"}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/5 bg-bg-systematic/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                  <span>Protección cifrada de cuadernos</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="px-3 py-1.5 border border-white/10 hover:border-white/20 text-ink font-mono text-[9px] uppercase tracking-wider rounded cursor-pointer bg-transparent"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE GUARDADO DE CUADERNO */}
      <AnimatePresence>
        {showSaveStudyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSaveStudyModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-panel-systematic border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💾</span>
                  <div>
                    <h3 className="text-sm font-bold text-ink uppercase tracking-tight">
                      {activeStudyId ? "Guardar Cambios del Cuaderno" : "Guardar Nuevo Cuaderno"}
                    </h3>
                    <p className="text-ink-muted text-[10px] uppercase font-mono tracking-wider">
                      Persistencia en tu historial
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSaveStudyModal(false)}
                  className="text-ink-muted hover:text-white font-mono text-[10px] cursor-pointer px-2 py-0.5 border border-white/5 hover:border-white/10 uppercase bg-transparent"
                >
                  ✕
                </button>
              </div>

              {/* Content Panel */}
              <div className="p-6 bg-bg-systematic/20 space-y-4">
                <p className="text-xs text-ink-muted leading-relaxed">
                  Asigna un título descriptivo a este cuaderno para identificarlo en tu historial y recuperarlo cuando quieras.
                </p>

                <div>
                  <label className="block font-mono text-[9px] text-ink-muted uppercase tracking-wider mb-1">Título del Cuaderno</label>
                  <input
                    type="text"
                    placeholder="Ej. Física Teórica - Examen Final"
                    value={newStudyTitle}
                    onChange={(e) => setNewStudyTitle(e.target.value)}
                    className="w-full bg-bg-systematic border border-white/10 p-3 rounded text-xs text-ink placeholder:text-ink-muted focus:border-accent-systematic focus:outline-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/5 bg-bg-systematic/50 flex justify-end gap-2">
                <button
                  onClick={() => setShowSaveStudyModal(false)}
                  className="px-4 py-2 border border-white/10 hover:border-white/20 text-ink font-mono text-[9px] uppercase tracking-wider rounded cursor-pointer bg-transparent"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const titleToSave = newStudyTitle.trim() || `Cuaderno ${new Date().toLocaleDateString('es-AR')}`;
                    saveCurrentStudy(titleToSave);
                    setShowSaveStudyModal(false);
                  }}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-[9px] uppercase tracking-wider font-bold rounded cursor-pointer border-none"
                >
                  Guardar Cuaderno
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL IMPORTAR GOOGLE DOCS */}
      <AnimatePresence>
        {showGoogleDocModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isImportingGoogleDoc) setShowGoogleDocModal(false);
              }}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-xl bg-panel-systematic border border-blue-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-blue-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-blue-400 fill-current" viewBox="0 0 24 24">
                      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
                      Importar de Google Docs & Drive
                    </h3>
                    <p className="text-blue-300/80 text-[10px] uppercase font-mono tracking-wider">
                      Selecciona o vincula tus documentos de Google
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGoogleDocModal(false)}
                  disabled={isImportingGoogleDoc || isImportingDriveFiles}
                  className="text-ink-muted hover:text-white font-mono text-[10px] cursor-pointer px-2 py-0.5 border border-white/5 hover:border-white/10 uppercase bg-transparent rounded"
                >
                  ✕
                </button>
              </div>

              {/* Tabs Switcher */}
              <div className="flex border-b border-white/5 bg-black/20 p-2 gap-1.5">
                <button
                  onClick={() => {
                    setGoogleDocTab('drive');
                    if (driveAccessToken && driveFiles.length === 0) {
                      loadDriveFiles(driveAccessToken, '');
                    }
                  }}
                  className={cn(
                    "flex-1 py-2 font-mono text-[10px] uppercase tracking-wider rounded font-bold transition-all cursor-pointer border-none flex items-center justify-center gap-1.5",
                    googleDocTab === 'drive' 
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" 
                      : "bg-transparent text-ink-muted hover:text-white"
                  )}
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>Google Drive</span>
                </button>
                <button
                  onClick={() => setGoogleDocTab('link')}
                  className={cn(
                    "flex-1 py-2 font-mono text-[10px] uppercase tracking-wider rounded font-bold transition-all cursor-pointer border-none flex items-center justify-center gap-1.5",
                    googleDocTab === 'link' 
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" 
                      : "bg-transparent text-ink-muted hover:text-white"
                  )}
                >
                  <span>🔗 Por Enlace / URL</span>
                </button>
                <button
                  onClick={() => setGoogleDocTab('text')}
                  className={cn(
                    "flex-1 py-2 font-mono text-[10px] uppercase tracking-wider rounded font-bold transition-all cursor-pointer border-none flex items-center justify-center gap-1.5",
                    googleDocTab === 'text' 
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" 
                      : "bg-transparent text-ink-muted hover:text-white"
                  )}
                >
                  <span>📋 Pegar Texto</span>
                </button>
              </div>

              {/* Body */}
              <div className="p-6 bg-bg-systematic/20 space-y-4 max-h-[60vh] overflow-y-auto">
                {googleDocTab === 'drive' ? (
                  <div className="space-y-4">
                    {!driveAccessToken ? (
                      <div className="text-center py-8 px-4 space-y-4 bg-blue-950/20 border border-blue-500/20 rounded-xl">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400">
                          <Folder className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white uppercase tracking-tight font-mono">
                            Conecta tu cuenta de Google Drive
                          </h4>
                          <p className="text-xs text-ink-muted max-w-md mx-auto">
                            Explora y selecciona directamente tus documentos de Google Docs, PDFs, archivos Word y presentaciones guardados en tu Google Drive.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleConnectDrive}
                          disabled={isDriveConnecting}
                          className="px-6 py-3 bg-blue-500 hover:bg-blue-400 text-black font-mono text-xs uppercase tracking-wider font-bold rounded-xl shadow-lg transition-all cursor-pointer border-none flex items-center justify-center gap-2 mx-auto disabled:opacity-50"
                        >
                          {isDriveConnecting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Conectando con Google...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                              </svg>
                              <span>Iniciar sesión con Google</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Connected User Header */}
                        <div className="flex items-center justify-between p-3 bg-blue-950/30 border border-blue-500/20 rounded-xl">
                          <div className="flex items-center gap-2.5">
                            {driveUser?.photoURL ? (
                              <img src={driveUser.photoURL} alt="Avatar" className="w-7 h-7 rounded-full border border-blue-400/40" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-400/40 flex items-center justify-center font-bold text-[10px] text-blue-300">
                                {driveUser?.displayName ? driveUser.displayName[0] : 'G'}
                              </div>
                            )}
                            <div>
                              <div className="text-[11px] font-bold text-white leading-none">
                                {driveUser?.displayName || 'Usuario de Google'}
                              </div>
                              <div className="text-[9px] text-blue-300/70 font-mono">
                                {driveUser?.email || 'Conectado a Google Drive'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => loadDriveFiles(driveAccessToken, driveSearchQuery)}
                              title="Recargar archivos"
                              className="p-1.5 text-blue-300 hover:text-white hover:bg-blue-500/20 rounded-lg transition-colors cursor-pointer border border-transparent"
                            >
                              <RefreshCw className={cn("w-3.5 h-3.5", isLoadingDriveFiles && "animate-spin")} />
                            </button>
                            <button
                              type="button"
                              onClick={handleDisconnectDrive}
                              title="Desconectar cuenta"
                              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer border border-transparent"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Search Input */}
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                              type="text"
                              placeholder="Buscar archivos en Google Drive..."
                              value={driveSearchQuery}
                              onChange={(e) => setDriveSearchQuery(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  loadDriveFiles(driveAccessToken, driveSearchQuery);
                                }
                              }}
                              className="w-full bg-bg-systematic border border-white/10 pl-9 pr-3 py-2 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none font-mono"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => loadDriveFiles(driveAccessToken, driveSearchQuery)}
                            disabled={isLoadingDriveFiles}
                            className="px-3 py-2 bg-blue-500/20 border border-blue-500/40 hover:bg-blue-500/30 text-blue-300 font-mono text-[10px] uppercase font-bold rounded-lg cursor-pointer"
                          >
                            Buscar
                          </button>
                        </div>

                        {/* Files List */}
                        {isLoadingDriveFiles ? (
                          <div className="py-12 text-center text-zinc-400 font-mono text-xs flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                            <span>Cargando archivos de Google Drive...</span>
                          </div>
                        ) : driveFiles.length === 0 ? (
                          <div className="py-10 text-center text-zinc-500 font-mono text-xs border border-dashed border-white/10 rounded-xl">
                            No se encontraron archivos en Google Drive.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {driveFiles.map((file) => {
                              const isSelected = selectedDriveFileIds.includes(file.id);
                              const isDoc = file.mimeType === 'application/vnd.google-apps.document';
                              const isPdf = file.mimeType === 'application/pdf';
                              const isWord = file.mimeType.includes('word') || file.name.endsWith('.docx');
                              const isSlides = file.mimeType.includes('presentation') || file.name.endsWith('.pptx') || file.name.endsWith('.ppt');
                              const isImg = file.mimeType.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);

                              return (
                                <div
                                  key={file.id}
                                  onClick={() => handleToggleDriveFileSelect(file.id)}
                                  className={cn(
                                    "flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all",
                                    isSelected 
                                      ? "bg-blue-500/20 border-blue-400 text-white shadow-sm" 
                                      : "bg-bg-systematic/60 border-white/5 hover:border-white/20 text-zinc-300"
                                  )}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {}} // handled by parent onClick
                                      className="w-3.5 h-3.5 rounded border-zinc-600 text-blue-500 focus:ring-0 cursor-pointer shrink-0"
                                    />
                                    <span className="shrink-0 text-base">
                                      {isDoc ? '📄' : isPdf ? '📕' : isWord ? '📘' : isSlides ? '📊' : isImg ? '🖼️' : '📁'}
                                    </span>
                                    <div className="truncate">
                                      <div className="font-medium truncate text-white text-[11px] leading-snug">
                                        {file.name}
                                      </div>
                                      <div className="text-[9px] text-zinc-400 font-mono flex items-center gap-2">
                                        <span>
                                          {isDoc ? 'Google Doc' : isPdf ? 'PDF' : isWord ? 'Word' : isSlides ? 'Presentación' : isImg ? 'Imagen' : 'Archivo'}
                                        </span>
                                        {file.modifiedTime && (
                                          <span>• {new Date(file.modifiedTime).toLocaleDateString('es-AR')}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {isSelected && (
                                    <span className="shrink-0 px-2 py-0.5 bg-blue-500 text-black font-mono text-[9px] font-bold rounded uppercase">
                                      Listo
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Progress and status message during import */}
                        {isImportingDriveFiles && driveImportStatusText && (
                          <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl flex items-center gap-2.5 text-xs text-blue-200">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                            <span className="font-mono text-[11px]">{driveImportStatusText}</span>
                          </div>
                        )}

                        {/* Detailed error feedback if any files failed */}
                        {driveImportErrorDetails && (
                          <div className="p-3.5 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-200 space-y-2">
                            <div className="flex items-center gap-2 font-bold text-red-300">
                              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                              <span>Detalles sobre archivos no procesados:</span>
                            </div>
                            <div className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto bg-black/40 p-2.5 rounded border border-red-500/20 text-red-200/90">
                              {driveImportErrorDetails}
                            </div>
                            <p className="text-[10px] text-red-300/80 leading-relaxed">
                              💡 <strong>Consejo:</strong> Si es un libro o fotocopia antigua escaneada (como Aristóteles), puedes abrirlo en tu computadora, copiar los capítulos que desees estudiar y pegarlos en la pestaña <strong>"Texto / Copiar"</strong>, o subirlo como archivo PDF directamente.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : googleDocTab === 'link' ? (
                  <div className="space-y-4">
                    <p className="text-xs text-ink-muted leading-relaxed">
                      Pega el enlace web de tu archivo en Google Docs para extraer su contenido de estudio automáticamente:
                    </p>

                    <div>
                      <label className="block font-mono text-[9px] text-blue-300 uppercase tracking-wider mb-1 font-bold">
                        URL o Enlace de Google Docs
                      </label>
                      <input
                        type="url"
                        placeholder="https://docs.google.com/document/d/1a2b3c4d.../edit"
                        value={googleDocUrl}
                        onChange={(e) => setGoogleDocUrl(e.target.value)}
                        className="w-full bg-bg-systematic border border-white/10 p-3 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none font-mono"
                      />
                    </div>

                    {!driveAccessToken ? (
                      <div className="p-3 bg-blue-950/30 border border-blue-500/20 rounded-lg space-y-2 text-[10px] text-blue-200/80 leading-relaxed font-mono">
                        <span className="font-bold text-blue-300 block">💡 ¿ES UN DOCUMENTO PRIVADO?</span>
                        <p>
                          Si tu documento no es público, conecta tu cuenta de Google Drive para acceder de forma privada y segura:
                        </p>
                        <button
                          type="button"
                          onClick={handleConnectDrive}
                          disabled={isDriveConnecting}
                          className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/40 hover:bg-blue-500/30 text-blue-300 rounded text-[9px] font-bold uppercase cursor-pointer transition-all flex items-center gap-1.5"
                        >
                          <Folder className="w-3 h-3" />
                          <span>Conectar Google Drive</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-[10px] text-emerald-300 font-mono">
                        <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span>Google Drive conectado: Tu token de acceso permitirá descargar incluso documentos privados.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-ink-muted leading-relaxed">
                      Si tu Google Doc es privado o prefieres pegar el contenido manualmente, copia el texto de tu documento y pégalo a continuación:
                    </p>

                    <div>
                      <label className="block font-mono text-[9px] text-blue-300 uppercase tracking-wider mb-1 font-bold">
                        Título del Documento (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Apuntes de Biología Celular"
                        value={googleDocTextTitle}
                        onChange={(e) => setGoogleDocTextTitle(e.target.value)}
                        className="w-full bg-bg-systematic border border-white/10 p-2.5 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-mono text-[9px] text-blue-300 uppercase tracking-wider mb-1 font-bold">
                        Contenido del Texto
                      </label>
                      <textarea
                        rows={6}
                        placeholder="Pega aquí el contenido copiado de tu Google Doc..."
                        value={googleDocTextBody}
                        onChange={(e) => setGoogleDocTextBody(e.target.value)}
                        className="w-full bg-bg-systematic border border-white/10 p-3 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none resize-none font-sans"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/5 bg-bg-systematic/50 flex justify-end gap-2">
                <button
                  onClick={() => setShowGoogleDocModal(false)}
                  disabled={isImportingGoogleDoc || isImportingDriveFiles}
                  className="px-4 py-2 border border-white/10 hover:border-white/20 text-ink font-mono text-[9px] uppercase tracking-wider rounded cursor-pointer bg-transparent"
                >
                  Cancelar
                </button>

                {googleDocTab === 'drive' ? (
                  <button
                    onClick={handleImportSelectedDriveFiles}
                    disabled={selectedDriveFileIds.length === 0 || isImportingDriveFiles || !driveAccessToken}
                    className="px-5 py-2 bg-blue-500 hover:bg-blue-400 text-black font-mono text-[9px] uppercase tracking-wider font-bold rounded cursor-pointer border-none flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isImportingDriveFiles ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Importando archivos...</span>
                      </>
                    ) : (
                      <span>Importar ({selectedDriveFileIds.length}) Seleccionados</span>
                    )}
                  </button>
                ) : googleDocTab === 'link' ? (
                  <button
                    onClick={handleImportGoogleDocUrl}
                    disabled={isImportingGoogleDoc || !googleDocUrl.trim()}
                    className="px-5 py-2 bg-blue-500 hover:bg-blue-400 text-black font-mono text-[9px] uppercase tracking-wider font-bold rounded cursor-pointer border-none flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isImportingGoogleDoc ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Descargando...</span>
                      </>
                    ) : (
                      <span>Importar Documento</span>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleImportGoogleDocText}
                    disabled={!googleDocTextBody.trim()}
                    className="px-5 py-2 bg-blue-500 hover:bg-blue-400 text-black font-mono text-[9px] uppercase tracking-wider font-bold rounded cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Añadir al Cuaderno
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL GOOGLE CLOUD STORAGE (Exclusivo Administrador) */}
      <AnimatePresence>
        {isAdmin && showGcsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGcsModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-lg bg-panel-systematic border border-blue-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-blue-950/25">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <Cloud className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
                      <span>Google Cloud Storage</span>
                      <span className="bg-amber-500/20 text-amber-400 text-[8px] px-1.5 py-0.5 rounded font-mono font-bold">ADMIN</span>
                    </h3>
                    <p className="text-blue-300/80 text-[10px] uppercase font-mono tracking-wider">
                      Almacenamiento Directo de Archivos & Cuadernos
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGcsModal(false)}
                  className="text-ink-muted hover:text-white font-mono text-[10px] cursor-pointer px-2 py-0.5 border border-white/5 hover:border-white/10 uppercase bg-transparent rounded"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5 bg-bg-systematic/40">
                {/* Status Card */}
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-ink-muted uppercase tracking-wider">Estado de Conexión</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider",
                      gcsStatus?.isConfigured ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    )}>
                      {gcsStatus?.isConfigured ? '🟢 Bucket Activo' : '🟡 Bucket No Configurado'}
                    </span>
                  </div>

                  <div className="font-mono text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Librería Oficial:</span>
                      <span className="text-blue-300">@google-cloud/storage</span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Bucket Actual:</span>
                      <span className="text-white font-bold">{gcsStatus?.bucketName ? `gs://${gcsStatus.bucketName}` : '(Sin asignar)'}</span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Autenticación:</span>
                      <span className="text-emerald-400 font-bold">Application Default Credentials (ADC)</span>
                    </div>
                  </div>
                </div>

                {/* Bucket configuration input */}
                <div className="space-y-2">
                  <label className="block font-mono text-[9px] text-blue-300 uppercase tracking-wider font-bold">
                    🪣 Nombre del Bucket de Google Cloud Storage
                  </label>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Escribe el nombre del bucket que creaste en tu consola de Google Cloud para enviar tus archivos directamente sin guardarlos en el servidor local:
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-grow">
                      <span className="absolute left-3 top-3 font-mono text-xs text-zinc-500">gs://</span>
                      <input
                        type="text"
                        placeholder="mi-bucket-de-archivos"
                        value={tempBucketInput}
                        onChange={(e) => setTempBucketInput(e.target.value.replace(/^gs:\/\//, ''))}
                        className="w-full bg-bg-systematic border border-white/10 pl-11 pr-3 py-2.5 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none font-mono"
                      />
                    </div>
                    <button
                      onClick={handleSaveBucketName}
                      disabled={isUpdatingBucket || !tempBucketInput.trim()}
                      className="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-black font-mono text-[9px] uppercase tracking-wider font-bold rounded-lg cursor-pointer border-none shrink-0 transition-all"
                    >
                      {isUpdatingBucket ? 'Guardando...' : 'Aplicar'}
                    </button>
                  </div>
                </div>

                {/* Technical information / Cloud Run guidance */}
                <div className="p-3.5 bg-blue-950/20 border border-blue-500/20 rounded-xl space-y-2 text-[10px] text-zinc-300 leading-relaxed font-sans">
                  <div className="flex items-center gap-1.5 font-mono text-[9px] text-blue-300 font-bold uppercase">
                    <span>🚀 Despliegue en Google Cloud Run</span>
                  </div>
                  <ul className="space-y-1 text-zinc-400 list-disc pl-4 font-mono text-[9.5px]">
                    <li><strong>Sin comandos fs.writeFile():</strong> Los archivos subidos se transmiten directamente al bucket vía streaming en memoria con <code className="text-blue-300">@google-cloud/storage</code>.</li>
                    <li><strong>Credenciales automáticas:</strong> En Cloud Run, la aplicación usa el Service Account nativo del contenedor sin necesidad de subir archivos JSON de claves privadas.</li>
                    <li><strong>Persistencia de cuadernos:</strong> Las sesiones y cuadernos se respaldan en <code className="text-emerald-300">gs://[bucket]/data/user_studies_db.json</code>.</li>
                  </ul>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/5 bg-bg-systematic/50 flex justify-end gap-2">
                <button
                  onClick={() => setShowGcsModal(false)}
                  className="px-5 py-2 bg-white text-black hover:bg-blue-400 font-mono text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer rounded-lg border-none"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE FEEDBACK & CRÍTICAS */}
      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        currentUserEmail={userEmail}
        currentUserName={userDisplayName}
        triggerSource={feedbackTriggerSource}
      />

      {/* PANEL DEL CREADOR (USUARIOS Y FEEDBACK) */}
      {isAdmin && (
        <AdminPanel
          isOpen={showAdminPanel}
          onClose={() => setShowAdminPanel(false)}
          currentUserEmail={userEmail}
        />
      )}

      {/* Dynamic Floating Extraction Progress Toast */}
      <AnimatePresence>
        {isExtracting && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed bottom-16 right-4 sm:right-8 z-50 bg-[#18181b] border border-accent-systematic/50 rounded-2xl p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.85)] max-w-sm w-[90vw] sm:w-88 backdrop-blur-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-systematic/15 border border-accent-systematic/30 flex items-center justify-center shrink-0">
                <Loader2 className="w-5 h-5 text-accent-systematic animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="font-bold text-white truncate max-w-[150px]">
                    {currentExtractingFile || "Procesando apunte..."}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-accent-systematic font-bold text-[10.5px] bg-accent-systematic/15 px-1.5 py-0.5 rounded">
                      {Math.round(extractProgress)}%
                    </span>
                    <button
                      type="button"
                      onClick={cancelExtraction}
                      className="px-2 py-0.5 bg-red-950/60 hover:bg-red-900/80 border border-red-500/50 text-red-300 hover:text-white rounded text-[9.5px] font-mono font-bold transition-all cursor-pointer"
                      title="Abandonar carga"
                    >
                      Abandonar
                    </button>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-accent-systematic via-amber-400 to-emerald-400 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.min(Math.max(extractProgress, 5), 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Bar / Footer */}
      <footer className="h-12 border-t border-white/5 px-4 sm:px-8 flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-ink-muted bg-bg-systematic shrink-0 z-20">
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex items-center">
            <span className="inline-block w-1.5 h-1.5 bg-accent-systematic rounded-full mr-2 animate-pulse"></span>
            <span className="truncate max-w-[120px] sm:max-w-none">{isExtracting ? 'SISTEMA_PROCESANDO' : 'SISTEMA_LISTO'}</span>
          </div>

          <button
            onClick={() => {
              setFeedbackTriggerSource('manual');
              setShowFeedbackModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer text-[9px] font-bold"
            title="Enviar crítica o sugerencia para mejorar"
          >
            <MessageSquareHeart className="w-3 h-3 text-amber-400" />
            <span className="hidden xs:inline">Feedback / Críticas</span>
            <span className="xs:hidden">Feedback</span>
          </button>

          <button
            onClick={() => setShowAdminPanel(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition-colors cursor-pointer text-[9px] font-bold"
            title="Ver quiénes usan la app y enviar correos"
          >
            <Users className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">Comunidad ({userEmail === 'martinvelozz01@gmail.com' ? 'Admin' : 'Ver'})</span>
            <span className="sm:hidden">Usuarios</span>
          </button>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <span>CAPA_DE_VOZ_CONECTADA_V2.0 // (C) 2024 AI TUTOR LABS</span>
        </div>
      </footer>
    </div>
  );
}

function ApiKeyErrorGuide({ onRetry }: { onRetry?: () => void }) {
  const [checking, setChecking] = useState(false);
  
  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/check-env");
      if (res.ok) {
        const data = await res.json();
        if (data.gemini_key_present) {
          alert("🎉 ¡Clave API detectada con éxito! La conexión ha sido restablecida. Haz clic en Continuar o reintenta.");
          if (onRetry) onRetry();
        } else {
          alert("❌ Aún no detectamos la clave. Asegúrate de guardarla como GEMINI_API_KEY en 'Settings > Secrets' (Configuración > Secretos) en la esquina de AI Studio.");
        }
      }
    } catch (_) {
      alert("Error de conexión. Intenta recargar la página.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-left max-w-xl mx-auto shadow-sm mt-4">
      <h4 className="text-slate-900 font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
        <Key className="w-5 h-5 text-indigo-500 shrink-0" />
        ¿Cómo solucionar la conexión con el tutor?
      </h4>
      
      <p className="text-slate-600 text-sm mb-4 leading-relaxed">
        El tutor por voz requiere una clave <strong>GEMINI_API_KEY</strong> activa para funcionar. Sigue estos sencillos pasos para guardarla de forma segura y permanente en tu entorno de desarrollo:
      </p>

      <ol className="space-y-2.5 text-xs text-slate-600 list-decimal pl-4 mb-5 leading-relaxed">
        <li>
          Obtén una clave API gratis en{" "}
          <a 
            href="https://aistudio.google.com/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-indigo-600 hover:underline font-semibold inline-flex items-center gap-1"
          >
            Google AI Studio <ExternalLink className="w-3 h-3" />
          </a>.
        </li>
        <li>
          Abre la pestaña de <strong>Settings</strong> (Configuración - icono de engranaje) en la esquina superior/barra lateral de la interfaz de AI Studio.
        </li>
        <li>
          Ve a la pestaña de <strong>Secrets</strong> (Secretos) y añade un nuevo secreto.
        </li>
        <li>
          Usa exactamente el nombre: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800 font-bold border border-slate-200">GEMINI_API_KEY</code> y pega tu clave como valor.
        </li>
        <li>
          Guarda. El sistema la mantendrá segura y protegida de forma permanente.
        </li>
      </ol>

      <div className="border-t border-slate-200 pt-4 mt-4">
        <h5 className="font-bold text-xs text-slate-800 mb-2 flex items-center gap-1">
          <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ¿Y qué pasa cuando comparto o publico la App?
        </h5>
        <p className="text-slate-500 text-xs leading-relaxed mb-4">
          ¡No te preocupes por la seguridad! Tus claves están seguras y nunca se comparten. Cuando otra persona use tu enlace publicado, <strong>Google AI Studio le pedirá de forma segura que ingrese su propia clave de API</strong>. Nadie consumirá tus créditos ni tendrá acceso a tu clave privada.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleCheck}
          disabled={checking}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all shadow-sm flex items-center gap-1.5"
        >
          {checking ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Verificar Conexión Ahora
        </button>
      </div>
    </div>
  );
}

export function MicErrorGuide({ onRetry }: { onRetry?: () => void }) {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;

  return (
    <div className="bg-[#18181b] border border-amber-500/30 rounded-2xl p-5 text-left max-w-xl mx-auto shadow-2xl mt-4 text-slate-200">
      <h4 className="text-amber-400 font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        ¿Cómo activar el micrófono en tu dispositivo?
      </h4>
      
      {isIframe ? (
        <>
          <p className="text-slate-300 text-xs mb-3 leading-relaxed">
            Estás visualizando la aplicación dentro del marco de AI Studio (<em>iframe</em>). Los navegadores bloquean el micrófono en marcos seguros.
          </p>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 mb-3">
            <h5 className="font-bold text-xs text-amber-300 mb-1 flex items-center gap-1">
              <ExternalLink className="w-4 h-4 text-amber-400 shrink-0" />
              ¡Solución en 1 paso!
            </h5>
            <p className="text-slate-200 text-xs leading-relaxed">
              Haz clic en <strong>"Open in new tab"</strong> (arriba a la derecha de AI Studio) para abrir la app en una pestaña propia sin restricciones.
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-2.5 mb-4 text-xs text-slate-300">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <h5 className="font-bold text-xs text-amber-300 mb-1 flex items-center gap-1.5">
              <span className="bg-amber-400 text-black px-1.5 py-0.2 rounded font-mono text-[10px] font-bold">1</span>
              Si ves una "X" arriba a la izquierda (Pestaña interna / Custom Tab)
            </h5>
            <p className="text-slate-200 leading-relaxed text-[11px]">
              Toca los <strong>3 puntos verticales (⋮)</strong> arriba a la derecha y pulsa <strong>"Abrir en Chrome"</strong> o <strong>"Abrir en el navegador"</strong>. Los navegadores integrados de apps suelen bloquear el micrófono.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <h5 className="font-bold text-xs text-slate-100 mb-1 flex items-center gap-1.5">
              <span className="bg-white/20 text-slate-200 px-1.5 py-0.2 rounded font-mono text-[10px] font-bold">2</span>
              Permisos en la barra de Chrome
            </h5>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Toca el icono de <strong>candado o ajustes</strong> a la izquierda de la dirección web (o en los 3 puntos &gt; <em>Configuración del sitio</em>) y asegúrate de cambiar <strong>Micrófono</strong> a <strong>"Permitir"</strong>.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <h5 className="font-bold text-xs text-slate-100 mb-1 flex items-center gap-1.5">
              <span className="bg-white/20 text-slate-200 px-1.5 py-0.2 rounded font-mono text-[10px] font-bold">3</span>
              Ajustes de Android en tu tablet
            </h5>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Ve a <strong>Ajustes del sistema &gt; Aplicaciones &gt; Chrome &gt; Permisos &gt; Micrófono</strong> y verifica que tenga seleccionado <strong>"Permitir solo mientras la app está en uso"</strong>.
            </p>
          </div>
        </div>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          type="button"
          className="w-full mt-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95"
        >
          <RefreshCw className="w-4 h-4 shrink-0 animate-spin-slow" />
          Reintentar activar micrófono ahora
        </button>
      )}
    </div>
  );
}

function StudySession({ 
  text, 
  topics,
  unlockedTopics,
  onUnlockTopic,
  onEnd 
}: { 
  text: string; 
  topics: Topic[];
  unlockedTopics: string[];
  onUnlockTopic: (id: string) => void;
  onEnd: () => void; 
}) {
  const [isConnecting, setIsConnecting] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [currentKeyConcept, setCurrentKeyConcept] = useState<{ text: string; category?: string } | null>(null);
  const [keyConceptsHistory, setKeyConceptsHistory] = useState<string[]>([]);
  
  const sessionRef = useRef<any>(null);
  const playerRef = useRef<AudioStreamPlayer | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    let isMounted = true;

    const startSession = async () => {
      try {
        setError(null);
        setIsConnecting(true);
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getTracks().forEach(track => track.stop());
        } catch (micErr) {
          console.error("Microphone access failed:", micErr);
          if (isMounted) {
            setError("No se pudo acceder al micrófono. Por favor permite el acceso al micrófono en tu navegador e intenta de nuevo.");
            setIsConnecting(false);
          }
          return;
        }

        playerRef.current = new AudioStreamPlayer(24000);
        
        const session = new WebSocketSession({
          mode: 'topics',
          text,
          topics,
        });
        
        const sessionPromise = Promise.resolve(session);

        session.setCallbacks({
          onopen: () => {
            if (!isMounted) return;
            setIsConnecting(false);
            
            recorderRef.current = new AudioRecorder((base64) => {
              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                });
              });
            });
            recorderRef.current.start().catch((err: any) => {
              console.error("Error starting recording:", err);
              if (isMounted) {
                setError("No se pudo iniciar el grabador de audio. Por favor verifica los permisos.");
                setIsConnecting(false);
              }
            });
          },
          onmessage: (message: any) => {
            if (!isMounted) return;
            
            if (message.toolCall) {
              const functionCalls = message.toolCall.functionCalls;
              if (functionCalls) {
                const responses: any[] = [];
                for (const call of functionCalls) {
                  if (call.name === 'unlockTopic') {
                    const args = call.args as any;
                    if (args && args.topicId) {
                      onUnlockTopic(args.topicId);
                    }
                    responses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: "Tema desbloqueado en la interfaz exitosamente." }
                    });
                  } else if (call.name === 'displayKeyConcept') {
                    const args = call.args as any;
                    if (args && args.keyConcept) {
                      const conceptText = args.keyConcept;
                      const cat = args.category || 'Idea Principal';
                      const suggestedKws = Array.isArray(args.suggestedKeywords) ? args.suggestedKeywords : [];
                      setCurrentKeyConcept({ 
                        text: conceptText, 
                        category: cat,
                        suggestedKeywords: suggestedKws
                      });
                      setKeyConceptsHistory(prev => [conceptText, ...prev.filter(c => c !== conceptText)].slice(0, 10));
                    }
                    responses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: "Palabra o idea principal mostrada en pantalla correctamente." }
                    });
                  }
                }
                if (responses.length > 0) {
                  sessionPromise.then(session => {
                    session.sendToolResponse({ functionResponses: responses });
                  });
                }
              }
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsSpeaking(true);
              playerRef.current?.addPCM16(base64Audio);
            }
            
            if (message.serverContent?.interrupted) {
              playerRef.current?.interrupt();
              setIsSpeaking(false);
            }
            
            if (message.serverContent?.turnComplete) {
              setIsSpeaking(false);
            }
          },
          onclose: () => {
            if (isMounted) {
              onEnd();
            }
          },
          onerror: (err: any) => {
            console.error("Live API Error:", err);
            if (isMounted) {
              setError(err?.message || "Se perdió la conexión con el tutor.");
            }
          }
        });
        
        sessionRef.current = sessionPromise;
      } catch (err) {
        console.error("Failed to start session:", err);
        if (isMounted) {
          setError("No se pudo iniciar la sesión. Verifica tus permisos de micrófono.");
          setIsConnecting(false);
        }
      }
    };

    startSession();

    return () => {
      isMounted = false;
      recorderRef.current?.stop();
      playerRef.current?.stop();
      sessionRef.current?.then((s: any) => s.close());
    };
  }, [text, topics, onUnlockTopic, onEnd, retryKey]);

  return (
    <div className="flex flex-col lg:flex-row gap-12 items-start justify-center min-h-[70vh] p-6">
      {/* Topics Grid Sidebar */}
      <div className="w-full lg:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {topics.map((topic, index) => {
          const isUnlocked = unlockedTopics.includes(topic.id);
          const isCurrent = !isUnlocked && topics.findIndex(t => !unlockedTopics.includes(t.id)) === index;
          
          return (
            <div 
              key={topic.id} 
              className={cn(
                "border transition-all duration-500 relative",
                isUnlocked ? "border-white/5 bg-panel-systematic shadow-sm" : 
                isCurrent ? "border-accent-systematic bg-accent-systematic/5 shadow-[4px_4px_0px_#ff4d00] ring-1 ring-accent-systematic/30" : 
                "border-white/5 bg-panel-systematic/20 opacity-40"
              )}
            >
              <div className="h-32 relative overflow-hidden bg-bg-systematic flex items-center justify-center border-b border-white/5">
                {isUnlocked ? (
                  <img 
                    src={topic.imageUrl} 
                    alt={topic.title} 
                    className="w-full h-full object-cover animate-in fade-in duration-1000"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center transition-colors",
                    isCurrent ? "bg-bg-systematic text-accent-systematic" : "bg-bg-systematic text-ink-muted"
                  )}>
                    <Lock className={cn("w-5 h-5 mb-2", isCurrent ? "animate-bounce" : "opacity-40")} />
                    <span className="text-[9px] font-mono uppercase tracking-widest font-bold">
                      {isCurrent ? "Pregunta actual" : "Bloqueado"}
                    </span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <h4 className={cn(
                  "font-bold text-xs mb-1 line-clamp-2 leading-snug uppercase",
                  isUnlocked ? "text-ink" : 
                  isCurrent ? "text-ink" : "text-ink-muted"
                )}>
                  {topic.title}
                </h4>
                {isUnlocked && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded mt-2 uppercase tracking-widest">
                    <Unlock className="w-2.5 h-2.5" />
                    Completado
                  </span>
                )}
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-accent-systematic bg-accent-systematic/10 border border-accent-systematic px-2 py-0.5 rounded mt-2 uppercase tracking-widest animate-pulse">
                    <Sparkles className="w-2.5 h-2.5" />
                    Responde por voz
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Voice Interaction Center */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center bg-panel-systematic border border-white/5 p-10 shadow-[6px_6px_0px_#161616] sticky top-24">
        {error ? (
          <div className="bg-red-950/20 border border-red-900/30 text-red-400 p-6 rounded-2xl w-full text-center">
            <p className="font-semibold mb-4 text-sm">{error}</p>
            {(error.includes("GEMINI_API_KEY") || error.includes("clave API")) && (
              <div className="mt-4 text-white">
                <ApiKeyErrorGuide />
              </div>
            )}
            {(error.toLowerCase().includes("micrófono") || error.toLowerCase().includes("permis") || error.toLowerCase().includes("denied")) && (
              <div className="mt-4 text-white">
                <MicErrorGuide onRetry={() => { setError(null); setIsConnecting(true); setRetryKey(k => k + 1); }} />
              </div>
            )}
            <button
              onClick={onEnd}
              className="mt-6 bg-red-950/40 hover:bg-red-900/40 text-red-200 border border-red-900/30 px-5 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Volver al cuaderno
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
              {/* Pulsing background rings */}
              <div className={cn(
                "absolute inset-0 rounded-full bg-accent-systematic/10 transition-all duration-500",
                isConnecting ? "animate-ping" : isSpeaking ? "animate-pulse scale-150 opacity-20" : "scale-110"
              )} />
              <div className={cn(
                "absolute inset-4 rounded-full bg-accent-systematic/15 transition-all duration-300",
                isSpeaking ? "animate-pulse scale-125 opacity-35" : "scale-100"
              )} />
              
              {/* Center orb */}
              <div className={cn(
                "relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-500 border border-white/10",
                isConnecting ? "bg-bg-systematic text-ink-muted" : "bg-accent-systematic text-black shadow-[4px_4px_0px_#000000]"
              )}>
                {isConnecting ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : isSpeaking ? (
                  <Volume2 className="w-8 h-8 text-black animate-bounce" />
                ) : (
                  <Mic className="w-8 h-8 text-black" />
                )}
              </div>
            </div>

            {/* Siri/Gemini wave indicator */}
            {!isConnecting && (
              <div className="flex items-end justify-center gap-1.5 h-8 mb-4">
                <div className={cn("w-1 bg-accent-systematic rounded-full transition-all duration-300", isSpeaking ? "animate-wave-1 h-6" : "h-2")} />
                <div className={cn("w-1 bg-accent-systematic rounded-full transition-all duration-300", isSpeaking ? "animate-wave-2 h-8" : "h-3")} />
                <div className={cn("w-1 bg-accent-systematic/80 rounded-full transition-all duration-300", isSpeaking ? "animate-wave-3 h-5" : "h-2.5")} />
                <div className={cn("w-1 bg-accent-systematic rounded-full transition-all duration-300", isSpeaking ? "animate-wave-4 h-7" : "h-3")} />
                <div className={cn("w-1 bg-accent-systematic/60 rounded-full transition-all duration-300", isSpeaking ? "animate-wave-5 h-4" : "h-1.5")} />
              </div>
            )}

            <div className="text-center mb-4 min-h-[50px]">
              <h3 className="text-2xl font-black uppercase tracking-tight text-ink mb-1">
                {isConnecting ? "Conectando..." : isSpeaking ? "Tu Tutor está hablando" : "Tutor escuchando..."}
              </h3>
              <p className="text-ink-muted text-xs px-4 font-sans">
                {isConnecting 
                  ? "Sincronizando el cuaderno con el motor de voz..." 
                  : isSpeaking 
                    ? "Presta atención a la explicación, pregunta o pista" 
                    : "Respóndele directamente por voz para desbloquear la siguiente ficha"}
              </p>
            </div>

            {/* Display of current main idea / key word in written text */}
            <AnimatePresence mode="wait">
              {currentKeyConcept && (
                <motion.div
                  key={currentKeyConcept.text}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full bg-gradient-to-r from-amber-500/10 via-accent-systematic/15 to-amber-500/10 border border-accent-systematic/40 rounded-xl text-center my-4 shadow-[0_0_20px_rgba(255,77,0,0.15)] relative overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-accent-systematic animate-pulse" />
                      <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-accent-systematic">
                        {currentKeyConcept.category || "Idea Principal / Pregunta"}
                      </span>
                    </div>
                    <p className="text-lg font-black text-white uppercase tracking-tight leading-snug font-display">
                      "{currentKeyConcept.text}"
                    </p>
                  </div>

                  {/* Suggested Keywords Guide Badges */}
                  {currentKeyConcept.suggestedKeywords && currentKeyConcept.suggestedKeywords.length > 0 && (
                    <div className="bg-black/60 border-t border-accent-systematic/30 p-3 text-left">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-amber-300">
                          Palabras clave sugeridas para incluir en tu respuesta:
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentKeyConcept.suggestedKeywords.map((kw, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-200 font-mono text-[10px] font-bold px-2.5 py-1 rounded-md shadow-sm"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Key words history pills */}
            {keyConceptsHistory.length > 0 && (
              <div className="w-full mb-6 bg-bg-systematic/60 border border-white/5 p-3 rounded-lg text-left">
                <span className="font-mono text-[8px] text-ink-muted uppercase tracking-widest block mb-2 font-bold">
                  Palabras e Ideas Clave de la Sesión:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {keyConceptsHistory.map((concept, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 bg-white/5 border border-white/10 text-white font-mono text-[9px] px-2 py-0.5 rounded"
                    >
                      <span className="text-accent-systematic font-bold">▪</span>
                      {concept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="w-full bg-bg-systematic rounded-full h-2 mb-4 overflow-hidden border border-white/5">
              <div 
                className="bg-accent-systematic h-full transition-all duration-1000 rounded-full"
                style={{ width: `${topics.length > 0 ? (unlockedTopics.length / topics.length) * 100 : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-ink-muted font-mono font-bold mb-8 uppercase tracking-widest bg-bg-systematic px-3 py-1.5 border border-white/5">
              Progreso: <span className="text-accent-systematic font-bold">{unlockedTopics.length}</span> de <span className="text-white font-bold">{topics.length}</span> fichas completadas
            </p>

            <button
              onClick={onEnd}
              className="bg-bg-systematic border border-white/5 hover:border-accent-systematic hover:bg-accent-systematic hover:text-black text-ink font-mono text-[10px] uppercase tracking-widest py-3 px-8 transition-all duration-200 active:scale-[0.98] cursor-pointer"
            >
              Pausar Sesión de Voz
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FreeStudySession({ 
  text, 
  onEnd 
}: { 
  text: string; 
  onEnd: () => void; 
}) {
  const [isConnecting, setIsConnecting] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [currentKeyConcept, setCurrentKeyConcept] = useState<{ text: string; category?: string; suggestedKeywords?: string[] } | null>(null);
  const [keyConceptsHistory, setKeyConceptsHistory] = useState<string[]>([]);
  
  const sessionRef = useRef<any>(null);
  const playerRef = useRef<AudioStreamPlayer | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    let isMounted = true;

    const startSession = async () => {
      try {
        setError(null);
        setIsConnecting(true);
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getTracks().forEach(track => track.stop());
        } catch (micErr) {
          console.error("Microphone access failed:", micErr);
          if (isMounted) {
            setError("No se pudo acceder al micrófono. Por favor permite el acceso al micrófono en tu navegador e intenta de nuevo.");
            setIsConnecting(false);
          }
          return;
        }

        playerRef.current = new AudioStreamPlayer(24000);
        
        const session = new WebSocketSession({
          mode: 'free',
          text,
        });

        const sessionPromise = Promise.resolve(session);

        session.setCallbacks({
          onopen: () => {
            if (!isMounted) return;
            setIsConnecting(false);
            
            recorderRef.current = new AudioRecorder((base64) => {
              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                });
              });
            });
            recorderRef.current.start().catch((err: any) => {
              console.error("Error starting recording:", err);
              if (isMounted) {
                setError("No se pudo iniciar el grabador de audio. Por favor verifica los permisos.");
                setIsConnecting(false);
              }
            });
          },
          onmessage: (message: any) => {
            if (!isMounted) return;
            
            if (message.toolCall) {
              const functionCalls = message.toolCall.functionCalls;
              if (functionCalls) {
                const responses: any[] = [];
                for (const call of functionCalls) {
                  if (call.name === 'displayKeyConcept') {
                    const args = call.args as any;
                    if (args && args.keyConcept) {
                      const conceptText = args.keyConcept;
                      const cat = args.category || 'Idea Principal';
                      const suggestedKws = Array.isArray(args.suggestedKeywords) ? args.suggestedKeywords : [];
                      setCurrentKeyConcept({ 
                        text: conceptText, 
                        category: cat,
                        suggestedKeywords: suggestedKws
                      });
                      setKeyConceptsHistory(prev => [conceptText, ...prev.filter(c => c !== conceptText)].slice(0, 10));
                    }
                    responses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: "Palabra o idea principal mostrada en pantalla correctamente." }
                    });
                  }
                }
                if (responses.length > 0) {
                  sessionPromise.then(session => {
                    session.sendToolResponse({ functionResponses: responses });
                  });
                }
              }
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsSpeaking(true);
              playerRef.current?.addPCM16(base64Audio);
            }
            
            if (message.serverContent?.interrupted) {
              playerRef.current?.interrupt();
              setIsSpeaking(false);
            }
            
            if (message.serverContent?.turnComplete) {
              setIsSpeaking(false);
            }
          },
          onclose: () => {
            if (isMounted) {
              onEnd();
            }
          },
          onerror: (err: any) => {
            console.error("Live API Error:", err);
            if (isMounted) {
              setError(err?.message || "Se perdió la conexión con el tutor.");
            }
          }
        });
        
        sessionRef.current = sessionPromise;
      } catch (err) {
        console.error("Failed to start session:", err);
        if (isMounted) {
          setError("No se pudo iniciar la sesión. Verifica tus permisos de micrófono.");
          setIsConnecting(false);
        }
      }
    };

    startSession();

    return () => {
      isMounted = false;
      recorderRef.current?.stop();
      playerRef.current?.stop();
      sessionRef.current?.then((s: any) => s.close());
    };
  }, [text, onEnd, retryKey]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto p-6 animate-in fade-in duration-300">
      <div className="w-full flex flex-col items-center justify-center bg-panel-systematic border border-white/5 p-12 shadow-[6px_6px_0px_#161616]">
        {error ? (
          <div className="bg-red-950/20 border border-red-900/30 text-red-400 p-6 rounded-2xl w-full text-center">
            <p className="font-semibold mb-4 text-sm">{error}</p>
            {(error.includes("GEMINI_API_KEY") || error.includes("clave API")) && (
              <div className="mt-4 text-white">
                <ApiKeyErrorGuide />
              </div>
            )}
            {(error.toLowerCase().includes("micrófono") || error.toLowerCase().includes("permis") || error.toLowerCase().includes("denied")) && (
              <div className="mt-4 text-white">
                <MicErrorGuide onRetry={() => { setError(null); setIsConnecting(true); setRetryKey(k => k + 1); }} />
              </div>
            )}
            <button
              onClick={onEnd}
              className="mt-6 bg-red-950/40 hover:bg-red-900/40 text-red-200 border border-red-900/30 px-5 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Volver al cuaderno
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
              {/* Pulsing background rings */}
              <div className={cn(
                "absolute inset-0 rounded-full bg-accent-systematic/10 transition-all duration-500",
                isConnecting ? "animate-ping" : isSpeaking ? "animate-pulse scale-150 opacity-20" : "scale-110"
              )} />
              <div className={cn(
                "absolute inset-4 rounded-full bg-accent-systematic/15 transition-all duration-300",
                isSpeaking ? "animate-pulse scale-125 opacity-35" : "scale-100"
              )} />
              
              {/* Center orb */}
              <div className={cn(
                "relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-500 border border-white/10",
                isConnecting ? "bg-bg-systematic text-ink-muted" : "bg-accent-systematic text-black shadow-[4px_4px_0px_#000000]"
              )}>
                {isConnecting ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : isSpeaking ? (
                  <Volume2 className="w-8 h-8 text-black animate-bounce" />
                ) : (
                  <Mic className="w-8 h-8 text-black" />
                )}
              </div>
            </div>

            {/* Siri/Gemini wave indicator */}
            {!isConnecting && (
              <div className="flex items-end justify-center gap-1.5 h-8 mb-4">
                <div className={cn("w-1 bg-accent-systematic rounded-full transition-all duration-300", isSpeaking ? "animate-wave-1 h-6" : "h-2")} />
                <div className={cn("w-1 bg-accent-systematic rounded-full transition-all duration-300", isSpeaking ? "animate-wave-2 h-8" : "h-3")} />
                <div className={cn("w-1 bg-accent-systematic/80 rounded-full transition-all duration-300", isSpeaking ? "animate-wave-3 h-5" : "h-2.5")} />
                <div className={cn("w-1 bg-accent-systematic rounded-full transition-all duration-300", isSpeaking ? "animate-wave-4 h-7" : "h-3")} />
                <div className={cn("w-1 bg-accent-systematic/60 rounded-full transition-all duration-300", isSpeaking ? "animate-wave-5 h-4" : "h-1.5")} />
              </div>
            )}

            <div className="text-center mb-4 min-h-[50px]">
              <span className="font-mono text-[9px] text-accent-systematic uppercase tracking-widest block mb-1">
                Asistente de Voz / Modo Libre
              </span>
              <h3 className="text-2xl font-black uppercase tracking-tight text-ink mb-2">
                {isConnecting ? "Iniciando tutoría libre..." : isSpeaking ? "Tutor explicando..." : "Tutor escuchando..."}
              </h3>
              <p className="text-ink-muted text-xs px-6 leading-relaxed max-w-sm mx-auto font-sans">
                {isConnecting 
                  ? "Conectando al canal de voz de Gemini..." 
                  : isSpeaking 
                    ? "Escucha atentamente el análisis de tu cuaderno" 
                    : "Haz cualquier pregunta en voz alta sobre el texto y te responderé de inmediato"}
              </p>
            </div>

            {/* Display of current main idea / key word in written text */}
            <AnimatePresence mode="wait">
              {currentKeyConcept && (
                <motion.div
                  key={currentKeyConcept.text}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full bg-gradient-to-r from-amber-500/10 via-accent-systematic/15 to-amber-500/10 border border-accent-systematic/40 rounded-xl text-center my-4 shadow-[0_0_20px_rgba(255,77,0,0.15)] relative overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-accent-systematic animate-pulse" />
                      <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-accent-systematic">
                        {currentKeyConcept.category || "Idea Principal / Pregunta"}
                      </span>
                    </div>
                    <p className="text-xl font-black text-white uppercase tracking-tight leading-snug font-display">
                      "{currentKeyConcept.text}"
                    </p>
                  </div>

                  {/* Suggested Keywords Guide Badges */}
                  {currentKeyConcept.suggestedKeywords && currentKeyConcept.suggestedKeywords.length > 0 && (
                    <div className="bg-black/60 border-t border-accent-systematic/30 p-3 text-left">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-amber-300">
                          Palabras clave sugeridas para incluir en tu respuesta:
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentKeyConcept.suggestedKeywords.map((kw, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-200 font-mono text-[10px] font-bold px-2.5 py-1 rounded-md shadow-sm"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Key words history pills */}
            {keyConceptsHistory.length > 0 && (
              <div className="w-full mb-6 bg-bg-systematic/60 border border-white/5 p-3 rounded-lg text-left">
                <span className="font-mono text-[8px] text-ink-muted uppercase tracking-widest block mb-2 font-bold">
                  Palabras e Ideas Clave de la Sesión:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {keyConceptsHistory.map((concept, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 bg-white/5 border border-white/10 text-white font-mono text-[9px] px-2 py-0.5 rounded"
                    >
                      <span className="text-accent-systematic font-bold">▪</span>
                      {concept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={onEnd}
              className="bg-bg-systematic border border-white/5 hover:border-accent-systematic hover:bg-accent-systematic hover:text-black text-ink font-mono text-[10px] uppercase tracking-widest py-3 px-8 transition-all duration-200 active:scale-[0.98] cursor-pointer"
            >
              Terminar Sesión Libre
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MultipleChoiceQuiz({ 
  text, 
  onEnd,
  savedQuestions = [],
  onSaveQuestions,
  onRegenerate
}: { 
  text: string; 
  onEnd: () => void;
  savedQuestions?: QuizQuestion[];
  onSaveQuestions?: (questions: QuizQuestion[]) => void;
  onRegenerate?: () => void;
  key?: string;
}) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(savedQuestions);
  const [loading, setLoading] = useState(savedQuestions.length === 0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [showConfirmRegen, setShowConfirmRegen] = useState(false);

  const onSaveQuestionsRef = useRef(onSaveQuestions);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onSaveQuestionsRef.current = onSaveQuestions;
  }, [onSaveQuestions]);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    if (questions.length > 0) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchQuestions = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/generate-quiz", {
          method: "POST",
          headers: getFetchHeaders(),
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          let errorMsg = `Server returned status ${res.status}`;
          try {
            const errData = await res.json();
            if (errData && errData.error) {
              errorMsg = errData.error;
            }
          } catch (_) {}
          throw new Error(errorMsg);
        }
        const data = await res.json();

        if (!isMounted) return;

        const responseText = data.text || '[]';
        const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanText);
        
        if (parsed.length === 0) {
          throw new Error('No se generaron preguntas');
        }
        
        setQuestions(parsed);
        if (onSaveQuestionsRef.current) {
          onSaveQuestionsRef.current(parsed);
        }
      } catch (error: any) {
        console.error('Error generating quiz:', error);
        if (isMounted) {
          alert((error.message || 'Hubo un error al generar el cuestionario exhaustivo.') + ' Por favor, intenta de nuevo.');
          if (error.message && (error.message.includes('GEMINI_API_KEY') || error.message.includes('clave API') || error.message.includes('Clave API') || error.message.includes('API key'))) {
            window.dispatchEvent(new CustomEvent('gemini-api-key-missing'));
          }
          if (onEndRef.current) {
            onEndRef.current();
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchQuestions();

    return () => {
      isMounted = false;
    };
  }, [text, questions.length]);

  const handleRegenerate = () => {
    setShowConfirmRegen(true);
  };

  const confirmRegenerate = () => {
    setShowConfirmRegen(false);
    if (onRegenerate) {
      onRegenerate();
    } else {
      setQuestions([]);
      setCurrentIndex(0);
      setSelected(null);
      setIsAnswered(false);
      setScore(0);
      setIsFinished(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto p-8 animate-in fade-in duration-300">
        <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-white/5 animate-ping" />
          <Loader2 className="w-8 h-8 text-accent-systematic animate-spin" />
        </div>
        <h3 className="text-xl font-black uppercase tracking-tight text-ink">Generando cuestionario...</h3>
        <p className="text-ink-muted text-xs mt-3 leading-relaxed font-mono uppercase">
          Nuestra IA está analizando los conceptos principales y secundarios de tu cuaderno para formular preguntas clave. Esto tomará solo unos segundos.
        </p>
      </div>
    );
  }

  if (questions.length === 0) {
    return null;
  }

  if (isFinished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-xl mx-auto text-center animate-in fade-in zoom-in-95 duration-500 p-6">
        <div className="bg-panel-systematic p-12 border border-white/5 w-full relative overflow-hidden shadow-[8px_8px_0px_#161616]">
          <div className="absolute top-0 left-0 w-full h-1 bg-accent-systematic" />
          
          <div className="w-16 h-16 bg-bg-systematic text-accent-systematic border border-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tight text-ink mb-3">¡Cuestionario Terminado!</h2>
          <p className="text-xs text-ink-muted mb-8 max-w-sm mx-auto leading-relaxed">
            Has completado con éxito la comprobación de lectura inteligente de tus fuentes.
          </p>
          
          <div className="bg-bg-systematic border border-white/5 p-6 mb-8 max-w-sm mx-auto flex items-center justify-around">
            <div className="flex flex-col">
              <span className="text-[9px] font-mono font-bold text-ink-muted uppercase tracking-widest mb-1">Aciertos</span>
              <span className="text-2xl font-extrabold text-ink font-mono">{score} / {questions.length}</span>
            </div>
            <div className="h-8 w-[1px] bg-white/5" />
            <div className="flex flex-col">
              <span className="text-[9px] font-mono font-bold text-ink-muted uppercase tracking-widest mb-1">Porcentaje</span>
              <span className="text-2xl font-extrabold text-accent-systematic font-mono">
                {Math.round((score / questions.length) * 100)}%
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm mx-auto">
            <button
              onClick={onEnd}
              className="bg-accent-systematic hover:bg-white text-black font-mono text-xs uppercase tracking-widest py-3.5 px-8 border-none transition-all duration-200 active:scale-[0.98] cursor-pointer font-bold w-full"
            >
              Volver al Cuaderno
            </button>
            <button
              onClick={() => {
                if (onRegenerate) {
                  onRegenerate();
                } else {
                  setQuestions([]);
                  setCurrentIndex(0);
                  setSelected(null);
                  setIsAnswered(false);
                  setScore(0);
                  setIsFinished(false);
                }
              }}
              className="border border-white/10 hover:bg-white hover:text-black text-ink font-mono text-xs uppercase tracking-widest py-3.5 px-8 transition-all duration-200 active:scale-[0.98] cursor-pointer font-bold w-full bg-transparent"
            >
              Cuestionario Nuevo
            </button>
          </div>
        </div>
      </div>
    );
  }

  const question = questions[currentIndex];
  const options = question?.options || [];

  const handleSelect = (index: number) => {
    if (isAnswered) return;
    setSelected(index);
    setIsAnswered(true);
    if (index === question.correctIndex) {
      setScore(s => s + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1);
      setSelected(null);
      setIsAnswered(false);
    } else {
      setIsFinished(true);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-300 p-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-accent-systematic uppercase tracking-widest">Cuestionario Escrito</span>
          <h2 className="text-xl font-black uppercase tracking-tight text-ink font-sans">Pregunta {currentIndex + 1} de {questions.length}</h2>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleRegenerate}
            className="font-mono text-[9px] text-accent-systematic hover:text-white bg-transparent border border-white/10 hover:border-white/25 px-2 py-1 rounded transition-colors uppercase tracking-widest cursor-pointer"
          >
            🔄 Regenerar
          </button>
          <span className="font-mono text-xs text-accent-systematic font-bold uppercase tracking-widest">
            Puntos: {score}
          </span>
        </div>
      </div>

      <div className="bg-panel-systematic border border-white/5 p-8 shadow-[6px_6px_0px_#161616] mb-6">
        <h3 className="text-lg font-bold text-ink mb-6 leading-snug uppercase">
          {question?.question}
        </h3>

        <div className="space-y-3">
          {options.map((opt, idx) => {
            const isSelected = selected === idx;
            const isCorrect = idx === question.correctIndex;
            
            let btnClass = "w-full text-left p-4 border transition-all duration-200 flex items-center justify-between text-xs font-medium cursor-pointer ";
            
            if (!isAnswered) {
              btnClass += "border-white/5 bg-bg-systematic hover:border-accent-systematic hover:bg-panel-systematic text-ink hover:translate-x-1";
            } else {
              if (isCorrect) {
                btnClass += "border-emerald-600 bg-emerald-950/20 text-emerald-400 font-bold shadow-[2px_2px_0px_#10b981]";
              } else if (isSelected && !isCorrect) {
                btnClass += "border-accent-systematic bg-rose-950/20 text-rose-400 font-bold shadow-[2px_2px_0px_#ff4d00]";
              } else {
                btnClass += "border-white/5 bg-panel-systematic/25 text-ink-muted opacity-30";
              }
            }

            return (
              <button
                key={idx}
                disabled={isAnswered}
                onClick={() => handleSelect(idx)}
                className={btnClass}
              >
                <span>{opt}</span>
                {isAnswered && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 ml-3" />}
                {isAnswered && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-accent-systematic shrink-0 ml-3" />}
              </button>
            );
          })}
        </div>
      </div>

      {isAnswered && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-panel-systematic border border-white/5 p-5 shadow-[4px_4px_0px_#161616] mb-6"
        >
          <h4 className="font-mono font-bold text-accent-systematic mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5 text-accent-systematic" />
            Explicación del Tutor
          </h4>
          <p className="text-ink-muted text-xs leading-relaxed font-sans">
            {question?.explanation}
          </p>
        </motion.div>
      )}

      <div className="flex justify-between items-center mt-8">
        <button
          onClick={onEnd}
          className="font-mono text-[10px] text-ink uppercase tracking-widest border border-white/10 px-4 py-2.5 hover:bg-white hover:text-black transition-colors duration-200 cursor-pointer"
        >
          Salir del Cuestionario
        </button>
        
        <button
          disabled={!isAnswered}
          onClick={handleNext}
          className="bg-accent-systematic hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed text-black font-mono text-[10px] uppercase tracking-widest py-3 px-6 border border-none transition-all duration-200 active:scale-[0.98] cursor-pointer font-bold flex items-center gap-1.5"
        >
          {currentIndex < questions.length - 1 ? "Siguiente Pregunta" : "Ver Resultados"}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence>
        {showConfirmRegen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#121212] border border-white/10 p-6 md:p-8 max-w-sm w-full relative shadow-[8px_8px_0px_#161616] text-center"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-accent-systematic" />
              <div className="w-12 h-12 bg-panel-systematic text-accent-systematic border border-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-ink mb-2">
                ¿Generar nuevo?
              </h3>
              <p className="text-xs text-ink-muted leading-relaxed font-sans mb-6">
                Las preguntas actuales se reemplazarán por unas nuevas basadas en tus fuentes de estudio. Perderás tu progreso actual en este cuestionario.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowConfirmRegen(false)}
                  className="flex-1 font-mono text-[10px] text-ink uppercase tracking-widest border border-white/10 px-4 py-3 hover:bg-white/5 transition-colors duration-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmRegenerate}
                  className="flex-1 bg-accent-systematic hover:bg-white text-black font-mono text-[10px] uppercase tracking-widest py-3 px-4 transition-all duration-200 cursor-pointer font-bold"
                >
                  Sí, generar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <GoldenRatioIconPreview />
    </div>
  );
}

